import { fetch } from "expo/fetch";
import { authClient } from "@/lib/auth/auth-client";
import { getBaseURL } from "@/lib/auth/utils";
import { z } from "zod";
import type { AgentTaskRequestSchema, AgentToolResultSchema } from "./schemas";
import { readTaskEvents } from "./task-stream";

const request = async (
  method: string,
  runId: string | undefined,
  body: unknown,
  signal?: AbortSignal,
) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  // A stalled acknowledgement must release the stream loop for a safe replay
  // from the stored receipt. GET lifetimes are controlled by the stream owner.
  const timeout = method !== "GET" ? setTimeout(abort, 15000) : undefined;
  try {
    const cookie = await authClient.getCookie();
    const response = await fetch(
      `${getBaseURL().replace(/\/$/, "")}/api/agent/tasks${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`,
      {
        method,
        credentials: "omit",
        signal: method === "GET" ? signal : controller.signal,
        headers: { Cookie: cookie ?? "", "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    // PATCH 409 means this authenticated run has already advanced past the
    // command. A replayed durable receipt needs no retry or connection warning.
    if (!response.ok && !(method === "PATCH" && response.status === 409))
      throw new Error(
        response.status === 401
          ? "Sign in to reconnect to your tasks."
          : "Couldn’t connect to the task service. Reconnecting…",
      );
    return response;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
};
export const createAgentTask = async (
  input: AgentTaskRequestSchema,
  signal: AbortSignal,
) => {
  const response = await request("POST", undefined, input, signal);
  return z
    .object({ id: z.string().regex(/^run_[a-zA-Z0-9_-]+$/) })
    .parse(await response.json());
};
export const completeAgentCommand = async (
  runId: string,
  tokenId: string,
  result: AgentToolResultSchema,
  signal: AbortSignal,
) => {
  await request("PATCH", runId, { tokenId, result }, signal);
};
export const subscribeAgentTask = async function* (
  runId: string,
  signal: AbortSignal,
) {
  const response = await request("GET", runId, undefined, signal);
  if (!response.body) throw new Error("Task updates are unavailable.");
  yield* readTaskEvents(response.body);
};
