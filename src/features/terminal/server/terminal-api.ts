import { z } from "zod";
import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/helpers";
import { serverEnv } from "@/data/env/server";
import { tasks, idempotencyKeys } from "@/services/trigger/server";
import type { deleteProjectSandboxTask } from "@/trigger/delete-project-sandbox";
import {
  maxSelectedSyncFileBytes,
  syncDownloadBatchFiles,
  maxSyncDownloadHeaderBytes,
  terminalMutationActions,
} from "../constants";
import { isReservedSyncRule } from "../lib/sync-plan";
import { parsePathRules } from "@/features/settings/lib/path-rules";
import { encodeSyncDownload } from "../lib/sync-download";
import { issueTerminalTicket } from "./ticket";
import {
  chargeCredits,
  InsufficientCreditsError,
  readBillingStatus,
} from "@/features/billing/server/billing-service";
import {
  checkedSandbox,
  deleteSandboxFile,
  downloadSandboxFile,
  downloadSandboxFiles,
  ensureSandbox,
  readSandboxManifestSnapshot,
  readSandboxFileHash,
  sandboxWorkspaceRoot,
  uploadSandboxFile,
  findOwnedSandbox,
  SandboxOwnershipError,
} from "./sandbox";

const ownerSchema = z.strictObject({
  projectId: z.uuid(),
  deviceId: z.uuid(),
  sandboxId: z.string().min(1).max(200).nullable(),
});
const mutationSchema = ownerSchema.extend({
  action: z.enum(terminalMutationActions),
  path: z.string().optional(),
  paths: z
    .array(z.string().min(1).max(4096))
    .min(1)
    .max(syncDownloadBatchFiles)
    .optional(),
  allowedPaths: z.array(z.string().min(1).max(128)).max(30).optional(),
  knownHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  expectedHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional(),
});
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const terminalWebSocketUrl = (request: Request) => {
  if (serverEnv.TERMINAL_WS_URL) return serverEnv.TERMINAL_WS_URL;
  if (!__DEV__) throw new Error("The terminal gateway URL is not configured.");
  const url = new URL(request.url);
  return `ws://${url.hostname}:8787/terminal`;
};

export const handleTerminalRequest = async (request: Request) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) return reply({ message: "Sign in to use the terminal." }, 401);
    if (request.method === "DELETE") {
      const raw = await request.text();
      if (raw.length > 2048) return reply({ message: "Invalid request." }, 400);
      const input = ownerSchema.parse(JSON.parse(raw));
      if (!input.sandboxId) return reply({ message: "Invalid sandbox." }, 400);
      const owner = {
        userId,
        projectId: input.projectId,
        deviceId: input.deviceId,
      };
      const sandbox = await findOwnedSandbox(input.sandboxId, owner);
      if (!sandbox) return reply({ accepted: true });
      const key = await idempotencyKeys.create(
        `sandbox-cleanup:${userId}:${input.deviceId}:${input.projectId}:${input.sandboxId}`,
        { scope: "global" },
      );
      await tasks.trigger<typeof deleteProjectSandboxTask>(
        "delete-project-sandbox",
        { ...owner, sandboxId: input.sandboxId },
        { idempotencyKey: key, idempotencyKeyTTL: "24h" },
      );
      return reply({ accepted: true }, 202);
    }
    const billing = await readBillingStatus(userId);
    if (billing.tier === "free")
      return reply(
        {
          message: "A paid plan or active trial is required for the sandbox.",
          action: "billing",
          reason: "plan",
        },
        402,
      );
    if (billing.monthlyCredits + billing.purchasedCredits < 1)
      return reply(
        {
          message: "Add credits to continue using the sandbox.",
          action: "billing",
          reason: "credits",
        },
        402,
      );
    const chargeStart = async (
      sandbox: { id: string },
      previousVersion: string,
    ) => {
      const id = createHash("sha256")
        .update(`${sandbox.id}:${previousVersion}`)
        .digest("hex");
      await chargeCredits(userId, `sandbox-start:${id}`, 2, "Sandbox start");
    };
    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > maxSyncDownloadHeaderBytes)
        return reply({ message: "Invalid request." }, 400);
      const input = mutationSchema.parse(JSON.parse(raw));
      const owner = {
        userId,
        deviceId: input.deviceId,
        projectId: input.projectId,
      };
      if (input.action === "ensure") {
        const sandbox = await ensureSandbox(
          owner,
          input.sandboxId,
          chargeStart,
        );
        await sandboxWorkspaceRoot(sandbox);
        return reply({ sandboxId: sandbox.id });
      }
      if (!input.sandboxId)
        return reply({ message: "Start the sandbox first." }, 400);
      const sandbox = await checkedSandbox(input.sandboxId, owner, chargeStart);
      const root = await sandboxWorkspaceRoot(sandbox);
      if (input.action === "download") {
        if (!input.paths)
          return reply({ message: "Missing download paths." }, 400);
        const files = await downloadSandboxFiles(sandbox, root, input.paths);
        return new Response(encodeSyncDownload(files), {
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/octet-stream",
          },
        });
      }
      if (input.action === "manifest") {
        const allowedPaths = input.allowedPaths ?? [];
        if (
          JSON.stringify(parsePathRules(allowedPaths.join("\n"))) !==
            JSON.stringify(allowedPaths) ||
          allowedPaths.some(isReservedSyncRule)
        )
          return reply({ message: "Invalid selected sync paths." }, 400);
        return reply(
          await readSandboxManifestSnapshot(
            sandbox,
            root,
            allowedPaths,
            input.knownHash,
          ),
        );
      }
      if (input.action === "delete") {
        if (!input.path) return reply({ message: "Missing path." }, 400);
        if (input.expectedHash === undefined)
          return reply({ message: "Missing file version." }, 400);
        const current = await readSandboxFileHash(sandbox, root, input.path);
        if (current !== input.expectedHash)
          return reply({ message: "Sandbox file changed during sync." }, 409);
        await deleteSandboxFile(sandbox, root, input.path);
        return reply({ deleted: true });
      }
      return reply({
        ticket: issueTerminalTicket(
          { ...owner, sandboxId: input.sandboxId },
          serverEnv.BETTER_AUTH_SECRET,
        ),
        url: terminalWebSocketUrl(request),
      });
    }
    const url = new URL(request.url);
    const input = ownerSchema.parse({
      projectId: url.searchParams.get("projectId"),
      deviceId: url.searchParams.get("deviceId"),
      sandboxId: url.searchParams.get("sandboxId"),
    });
    if (!input.sandboxId)
      return reply({ message: "Start the sandbox first." }, 400);
    const sandbox = await checkedSandbox(
      input.sandboxId,
      { userId, ...input },
      chargeStart,
    );
    const root = await sandboxWorkspaceRoot(sandbox);
    const path = url.searchParams.get("path");
    if (!path) return reply({ message: "Missing path." }, 400);
    if (request.method === "GET") {
      const bytes = await downloadSandboxFile(sandbox, root, path);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/octet-stream",
        },
      });
    }
    if (request.method === "PUT") {
      if (
        Number(request.headers.get("content-length")) > maxSelectedSyncFileBytes
      )
        return reply({ message: "File exceeds the sync limit." }, 413);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > maxSelectedSyncFileBytes)
        return reply({ message: "File exceeds the sync limit." }, 413);
      const expectedHash = url.searchParams.get("expectedHash");
      const current = await readSandboxFileHash(sandbox, root, path);
      if ((current ?? "") !== (expectedHash ?? ""))
        return reply({ message: "Sandbox file changed during sync." }, 409);
      await uploadSandboxFile(sandbox, root, path, bytes);
      return reply({ uploaded: true });
    }
    return reply({ message: "Method not allowed." }, 405);
  } catch (error) {
    if (error instanceof SandboxOwnershipError)
      return reply({ message: error.message }, 403);
    if (error instanceof InsufficientCreditsError)
      return reply(
        {
          message: "Add credits to continue using the sandbox.",
          action: "billing",
          reason: "credits",
        },
        402,
      );
    return reply(
      {
        message:
          error instanceof Error
            ? error.message
            : "Terminal service unavailable.",
      },
      request.method === "DELETE" &&
        !(error instanceof z.ZodError) &&
        !(error instanceof SyntaxError)
        ? 500
        : 400,
    );
  }
};
