import { hashWorkspaceManifest } from "../lib/manifest-hash";
import { decodeSyncDownload } from "../lib/sync-download";
import {
  terminalRequestTimeoutMs,
  type TerminalDenialReason,
} from "../constants";
import { fetch } from "expo/fetch";
import { z } from "zod";
import { getDeviceId } from "@/lib/device-id";
import { authClient } from "@/lib/auth/auth-client";
import { getBaseURL } from "@/lib/auth/utils";
import type { WorkspaceManifest } from "../lib/sync-plan";

const terminalPath = `${getBaseURL().replace(/\/$/, "")}/api/terminal`;
const manifestSchema = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/));

export const getTerminalDeviceId = getDeviceId;

export type ManifestDiagnostics = {
  fingerprintMs: number;
  networkMs: number;
  unchanged: boolean;
  serverMs?: number;
  serverHashed?: number;
  serverReused?: number;
};

export type TerminalAccessRequirement = TerminalDenialReason | "billing";

export class TerminalAccessError extends Error {
  readonly name = "TerminalAccessError";

  constructor(
    message: string,
    readonly requirement: TerminalAccessRequirement,
  ) {
    super(message);
  }
}

const request = async <T = void>(
  url: string,
  init: RequestInit,
  read?: (response: Response) => Promise<T>,
  timeoutMs = terminalRequestTimeoutMs,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const cookie = await authClient.getCookie();
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: "omit",
      headers: { Cookie: cookie ?? "", ...init.headers },
    });
    if (!response.ok) {
      let message = `Terminal API unavailable (HTTP ${response.status}). Restart pnpm ios and try again.`;
      let action: unknown;
      let reason: unknown;
      try {
        const body = await response.json();
        if (typeof body?.message === "string") message = body.message;
        action = body?.action;
        reason = body?.reason;
      } catch {
        /* Keep the status when a proxy returns HTML. */
      }
      if (response.status === 402 && action === "billing")
        throw new TerminalAccessError(
          message,
          reason === "plan" || reason === "credits" ? reason : "billing",
        );
      throw new Error(message);
    }
    return read ? await read(response) : (undefined as T);
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("Terminal request timed out. Try syncing again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const context = (projectId: string, deviceId: string, sandboxId: string) => ({
  projectId,
  deviceId,
  sandboxId,
});

export const terminalApi = {
  deleteSandbox: (projectId: string, deviceId: string, sandboxId: string) =>
    request(
      terminalPath,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context(projectId, deviceId, sandboxId)),
      },
      async (response) => {
        z.object({ accepted: z.literal(true) }).parse(await response.json());
      },
      15_000,
    ),
  ensure: async (
    projectId: string,
    deviceId: string,
    sandboxId: string | null,
  ) =>
    z.object({ sandboxId: z.string().min(1) }).parse(
      await request(
        terminalPath,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ensure",
            ...context(projectId, deviceId, sandboxId ?? ""),
            sandboxId,
          }),
        },
        (response) => response.json(),
      ),
    ).sandboxId,
  manifest: async (
    projectId: string,
    deviceId: string,
    sandboxId: string,
    allowedPaths: readonly string[] = [],
    knownManifest?: WorkspaceManifest,
    onMetrics?: (metrics: ManifestDiagnostics) => void,
  ): Promise<WorkspaceManifest> => {
    const started = Date.now();
    const knownHash = knownManifest
      ? await hashWorkspaceManifest(knownManifest)
      : undefined;
    const fingerprintMs = Date.now() - started;
    const requestedAt = Date.now();
    const result = z
      .object({
        manifest: manifestSchema.optional(),
        hash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        unchanged: z.boolean().optional(),
        metrics: z
          .object({
            durationMs: z.number().nonnegative(),
            hashed: z.number().nonnegative(),
            reused: z.number().nonnegative(),
          })
          .optional(),
      })
      .parse(
        await request(
          terminalPath,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "manifest",
              ...context(projectId, deviceId, sandboxId),
              allowedPaths,
              ...(knownHash ? { knownHash } : {}),
            }),
          },
          (response) => response.json(),
        ),
      );
    onMetrics?.({
      fingerprintMs,
      networkMs: Date.now() - requestedAt,
      unchanged: result.unchanged ?? false,
      ...(result.metrics
        ? {
            serverMs: result.metrics.durationMs,
            serverHashed: result.metrics.hashed,
            serverReused: result.metrics.reused,
          }
        : {}),
    });
    if (result.unchanged) {
      if (!knownManifest || !knownHash || result.hash !== knownHash)
        throw new Error(
          "The sandbox returned a mismatched manifest fingerprint.",
        );
      return knownManifest;
    }
    if (!result.manifest)
      throw new Error("The sandbox returned no workspace manifest.");
    return result.manifest;
  },
  ticket: async (projectId: string, deviceId: string, sandboxId: string) =>
    z.object({ ticket: z.string(), url: z.url() }).parse(
      await request(
        terminalPath,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ticket",
            ...context(projectId, deviceId, sandboxId),
          }),
        },
        (response) => response.json(),
      ),
    ),
  upload: async (
    projectId: string,
    deviceId: string,
    sandboxId: string,
    path: string,
    bytes: Uint8Array,
    expectedHash: string | undefined,
  ) => {
    const params = new URLSearchParams({
      ...context(projectId, deviceId, sandboxId),
      path,
      expectedHash: expectedHash ?? "",
    });
    await request(`${terminalPath}?${params}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(bytes),
    });
  },
  download: async (
    projectId: string,
    deviceId: string,
    sandboxId: string,
    path: string,
  ) => {
    const params = new URLSearchParams({
      ...context(projectId, deviceId, sandboxId),
      path,
    });
    return new Uint8Array(
      await request(
        `${terminalPath}?${params}`,
        { method: "GET" },
        (response) => response.arrayBuffer(),
      ),
    );
  },
  downloadBatch: async (
    projectId: string,
    deviceId: string,
    sandboxId: string,
    paths: readonly string[],
  ) =>
    decodeSyncDownload(
      new Uint8Array(
        await request(
          terminalPath,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "download",
              ...context(projectId, deviceId, sandboxId),
              paths,
            }),
          },
          (response) => response.arrayBuffer(),
        ),
      ),
      paths,
    ),
  delete: async (
    projectId: string,
    deviceId: string,
    sandboxId: string,
    path: string,
    expectedHash: string | undefined,
  ) => {
    await request(terminalPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        ...context(projectId, deviceId, sandboxId),
        path,
        expectedHash: expectedHash ?? null,
      }),
    });
  },
};
