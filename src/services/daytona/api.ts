import { z } from "zod";
import { serverEnv } from "@/data/env/server";

export class SandboxFilesError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "SandboxFilesError";
  }
}

export const requestDaytona = async (
  url: string,
  init?: RequestInit,
  failureResponse?: (response: Response) => Promise<SandboxFilesError>,
): Promise<unknown> => {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${serverEnv.DAYTONA_API_KEY}`);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(url, {
      ...init, headers, redirect: "error", signal: init?.signal ?? AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // Operations with actionable Git failures may translate the provider body.
      // Other requests keep the existing generic response and never expose it.
      if (failureResponse) throw await failureResponse(response);
      throw new SandboxFilesError(response.status === 404 ? 404 : 502, "DAYTONA_REQUEST_FAILED", "Unable to access your workspace. Please try again.");
    }
    // File deletion can succeed without a JSON body.
    const body = await response.text();
    return body === "" ? null : JSON.parse(body);
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    throw new SandboxFilesError(502, "DAYTONA_REQUEST_FAILED", "The workspace request could not be completed. Please refresh and try again.");
  }
};

const sandboxDetailsSchema = z.object({
  id: z.string(), state: z.string(),
  labels: z.record(z.string(), z.string()).default({}),
  toolboxProxyUrl: z.url().optional(),
});
export type SandboxDetailsSchema = z.infer<typeof sandboxDetailsSchema>;

// Share the same ownership and restoration rules across SDK and HTTP operations.
export const ensureSandboxReady = async (details: unknown, sandboxId: string, projectId: string) => {
  const sandbox = sandboxDetailsSchema.parse(details);
  if (sandbox.id !== sandboxId || sandbox.labels.codaloudApp !== "codaloud" || sandbox.labels.codaloudProjectId !== projectId) {
    throw new SandboxFilesError(409, "SANDBOX_MISMATCH", "The sandbox does not belong to this project.");
  }
  if (sandbox.state === "stopped" || sandbox.state === "archived") {
    await requestDaytona(`https://app.daytona.io/api/sandbox/${encodeURIComponent(sandboxId)}/start`, { method: "POST" });
    throw new SandboxFilesError(503, "WORKSPACE_RESTORING", "Restoring your workspace. Please try again in a moment.");
  }
  if (["starting", "restoring", "archiving", "stopping", "pending_build", "building", "creating", "pulling_snapshot"].includes(sandbox.state)) {
    throw new SandboxFilesError(503, "WORKSPACE_RESTORING", "Your workspace is getting ready. Please try again in a moment.");
  }
  if (sandbox.state !== "started") {
    throw new SandboxFilesError(409, "WORKSPACE_UNAVAILABLE", "Your workspace is unavailable. Please try reopening the project.");
  }
  return sandbox;
};

export const getSandboxToolboxUrl = async (sandboxId: string, projectId: string) => {
  const sandboxUrl = `https://app.daytona.io/api/sandbox/${encodeURIComponent(sandboxId)}`;
  let result: unknown;
  try {
    result = await requestDaytona(sandboxUrl);
  } catch (error) {
    if (error instanceof SandboxFilesError && error.status === 404) {
      throw new SandboxFilesError(409, "SANDBOX_MISSING", "Your saved sandbox could not be found. It has not been replaced.");
    }
    throw error;
  }
  const sandbox = await ensureSandboxReady(result, sandboxId, projectId);
  const proxy = sandbox.toolboxProxyUrl ?? z.object({ url: z.url() }).parse(
    await requestDaytona(`${sandboxUrl}/toolbox-proxy-url`),
  ).url;
  const url = new URL(proxy);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new SandboxFilesError(502, "INVALID_TOOLBOX_URL", "Daytona returned an invalid workspace address.");
  }
  return `${proxy.replace(/\/$/, "")}/${encodeURIComponent(sandboxId)}`;
};
