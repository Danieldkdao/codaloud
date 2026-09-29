import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/helpers";
import { serverEnv } from "@/data/env/server";
import { issueTerminalTicket } from "./ticket";
import {
  checkedSandbox,
  deleteSandboxFile,
  downloadSandboxFile,
  ensureSandbox,
  readSandboxManifest,
  readSandboxFileHash,
  sandboxWorkspaceRoot,
  uploadSandboxFile,
} from "./sandbox";

const ownerSchema = z.strictObject({
  projectId: z.uuid(),
  deviceId: z.uuid(),
  sandboxId: z.string().min(1).max(200).nullable(),
});
const mutationSchema = ownerSchema.extend({
  action: z.enum(["ensure", "manifest", "delete", "ticket"]),
  path: z.string().optional(),
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
    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 4096) return reply({ message: "Invalid request." }, 400);
      const input = mutationSchema.parse(JSON.parse(raw));
      const owner = {
        userId,
        deviceId: input.deviceId,
        projectId: input.projectId,
      };
      if (input.action === "ensure") {
        const sandbox = await ensureSandbox(owner, input.sandboxId);
        await sandboxWorkspaceRoot(sandbox);
        return reply({ sandboxId: sandbox.id });
      }
      if (!input.sandboxId)
        return reply({ message: "Start the sandbox first." }, 400);
      const sandbox = await checkedSandbox(input.sandboxId, owner);
      const root = await sandboxWorkspaceRoot(sandbox);
      if (input.action === "manifest")
        return reply({ manifest: await readSandboxManifest(sandbox, root) });
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
    const sandbox = await checkedSandbox(input.sandboxId, { userId, ...input });
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
      if (Number(request.headers.get("content-length")) > 32 * 1024 * 1024)
        return reply({ message: "File exceeds the sync limit." }, 413);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > 32 * 1024 * 1024)
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
    return reply(
      {
        message:
          error instanceof Error
            ? error.message
            : "Terminal service unavailable.",
      },
      400,
    );
  }
};
