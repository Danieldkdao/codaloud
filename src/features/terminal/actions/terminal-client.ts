import { fetch } from "expo/fetch";
import { z } from "zod";
import { getDeviceId } from "@/lib/device-id";
import { authClient } from "@/lib/auth/auth-client";
import { getBaseURL } from "@/lib/auth/utils";
import type { WorkspaceManifest } from "../lib/sync-plan";

const terminalPath = `${getBaseURL().replace(/\/$/, "")}/api/terminal`;
const manifestSchema = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/));

export const getTerminalDeviceId = getDeviceId;

const request = async (url: string, init: RequestInit) => {
  const cookie = await authClient.getCookie();
  const response = await fetch(url, {
    ...init,
    credentials: "omit",
    headers: { Cookie: cookie ?? "", ...init.headers },
  });
  if (!response.ok) {
    let message = "The sandbox is unavailable. Try again.";
    try {
      const body = await response.json();
      if (typeof body?.message === "string") message = body.message;
    } catch {
      /* Preserve the useful status if a proxy returns HTML. */
    }
    throw new Error(message);
  }
  return response;
};

const context = (projectId: string, deviceId: string, sandboxId: string) => ({
  projectId,
  deviceId,
  sandboxId,
});

export const terminalApi = {
  ensure: async (
    projectId: string,
    deviceId: string,
    sandboxId: string | null,
  ) =>
    z.object({ sandboxId: z.string().min(1) }).parse(
      await (
        await request(terminalPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ensure",
            ...context(projectId, deviceId, sandboxId ?? ""),
            sandboxId,
          }),
        })
      ).json(),
    ).sandboxId,
  manifest: async (
    projectId: string,
    deviceId: string,
    sandboxId: string,
  ): Promise<WorkspaceManifest> =>
    z.object({ manifest: manifestSchema }).parse(
      await (
        await request(terminalPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "manifest",
            ...context(projectId, deviceId, sandboxId),
          }),
        })
      ).json(),
    ).manifest,
  ticket: async (projectId: string, deviceId: string, sandboxId: string) =>
    z.object({ ticket: z.string(), url: z.url() }).parse(
      await (
        await request(terminalPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ticket",
            ...context(projectId, deviceId, sandboxId),
          }),
        })
      ).json(),
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
      await (
        await request(`${terminalPath}?${params}`, { method: "GET" })
      ).arrayBuffer(),
    );
  },
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
