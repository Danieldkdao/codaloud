import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { tasks, runs, wait, idempotencyKeys } from "@/services/trigger/server";
import {
  agentTaskRequestSchema,
  agentTaskEventSchema,
  agentCommandSchema,
  agentToolResultSchema,
} from "../schemas";
import type { workspaceTask } from "@/trigger/workspace-task";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const readBody = async (request: Request) => {
  const text = await request.text();
  if (text.length > 128000) throw new Error("Request too large");
  return JSON.parse(text) as unknown;
};
export const handleAgentRequest = async (request: Request) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return reply({ message: "Sign in to run tasks." }, 401);
    if (request.method === "POST") {
      const input = agentTaskRequestSchema.safeParse(await readBody(request));
      if (!input.success)
        return reply({ message: "Invalid task request." }, 400);
      const key = await idempotencyKeys.create(
        `${session.user.id}:${input.data.deviceId}:${input.data.requestId}`,
        { scope: "global" },
      );
      const run = await tasks.trigger<typeof workspaceTask>(
        "workspace-task",
        { ...input.data, userId: session.user.id },
        {
          idempotencyKey: key,
          idempotencyKeyTTL: "24h",
          maxAttempts: 1,
          concurrencyKey: `${session.user.id}:${input.data.deviceId}:${input.data.projectId}`,
          tags: [`user:${session.user.id}`],
        },
      );
      return reply({ id: run.id }, 202);
    }
    const runId = new URL(request.url).searchParams.get("runId");
    if (!runId || !/^run_[a-zA-Z0-9_-]{1,200}$/.test(runId))
      return reply({ message: "Invalid task." }, 400);
    const run = await runs.retrieve<typeof workspaceTask>(runId);
    if (run.payload?.userId !== session.user.id)
      return reply({ message: "This task is not yours." }, 403);
    if (request.method === "PATCH") {
      const input = z
        .object({ tokenId: z.string().max(256), result: agentToolResultSchema })
        .safeParse(await readBody(request));
      if (!input.success)
        return reply({ message: "Invalid task result." }, 400);
      const command = agentCommandSchema.safeParse(run.metadata?.command);
      if (!command.success || command.data.tokenId !== input.data.tokenId)
        return reply({ message: "This task step is no longer pending." }, 409);
      await wait.completeToken(input.data.tokenId, input.data.result);
      return reply({ accepted: true });
    }
    if (request.method !== "GET")
      return reply({ message: "Method not allowed." }, 405);
    const subscription = runs.subscribeToRun<typeof workspaceTask>(runId);
    const encoder = new TextEncoder();
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let closeStream: () => void;
    const stop = () => {
      subscription.unsubscribe();
      clearTimeout(timer);
      clearInterval(heartbeat);
      request.signal.removeEventListener("abort", closeStream);
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if (!closed) {
            closed = true;
            stop();
            controller.close();
          }
        };
        closeStream = close;
        // Short connections rotate and re-authenticate. The native client resumes
        // from the latest durable snapshot; a disconnect never cancels the run.
        timer = setTimeout(close, 45000);
        heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode("\n"));
        }, 10000);
        request.signal.addEventListener("abort", closeStream, { once: true });
        if (request.signal.aborted) {
          close();
          return;
        }
        void (async () => {
          try {
            for await (const update of subscription) {
              if (closed) break;
              const terminal =
                update.status === "COMPLETED" ||
                [
                  "FAILED",
                  "CANCELED",
                  "CRASHED",
                  "SYSTEM_FAILURE",
                  "EXPIRED",
                  "TIMED_OUT",
                ].includes(update.status);
              const command =
                terminal || !update.metadata?.command
                  ? null
                  : agentCommandSchema.parse(update.metadata.command);
              const event = agentTaskEventSchema.parse({
                id: runId,
                status:
                  update.status === "COMPLETED"
                    ? "completed"
                    : terminal
                      ? "failed"
                      : command?.name === "beginTask"
                        ? "queued"
                        : command
                          ? "waiting"
                          : update.status === "QUEUED"
                            ? "queued"
                            : "running",
                logs: update.metadata?.logs ?? [],
                command,
                summary:
                  update.status === "COMPLETED"
                    ? update.output?.summary
                    : terminal
                      ? "The task failed. Review any completed steps before trying again."
                      : update.metadata?.summary,
              });
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
              if (terminal) break;
            }
            close();
          } catch {
            if (!closed) {
              closed = true;
              stop();
              controller.error(new Error("Task updates interrupted."));
            }
          }
        })();
      },
      cancel() {
        closed = true;
        stop();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return reply(
      {
        message: "Tasks are unavailable. Check the task service and try again.",
      },
      503,
    );
  }
};
