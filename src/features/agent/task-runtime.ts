import Storage from "expo-sqlite/kv-store";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import {
  createAgentTask,
  completeAgentCommand,
  subscribeAgentTask,
} from "./actions";
import { createDeviceExecutor } from "./device-executor";
import { executeDeviceTool, readWorkspaceRevision } from "./tools/device-tools";
import { agentTaskEventSchema, agentTaskRequestSchema } from "./schemas";
import { flushAgentWorkspace, runAgentMutation } from "./workspace-access";
import {
  workspaceTools,
  type WorkspaceToolName,
} from "./tools/workspace-tools";
import type { AgentTaskRecord } from "./types";

let userId: string | null = null;
let active = false;
let generation = 0;
let records: AgentTaskRecord[] = [];
let hydrated: Promise<void> = Promise.resolve();
let writes = Promise.resolve();
let admissions = Promise.resolve();
const listeners = new Set<() => void>();
const running = new Map<string, AbortController>();
const finished = (record: AgentTaskRecord) =>
  record.event.status === "completed" || record.event.status === "failed";
const publish = () => {
  records = [...records];
  listeners.forEach((listener) => listener());
};
const persist = () => {
  const owner = userId;
  const data = JSON.stringify(records);
  if (!owner) return Promise.resolve();
  const next = writes
    .catch(() => {})
    .then(() => Storage.setItem(`codaloud.agent.tasks.${owner}`, data));
  writes = next;
  return next;
};
const update = (record: AgentTaskRecord, patch: Partial<AgentTaskRecord>) => {
  Object.assign(record, patch);
  publish();
};
const execute = createDeviceExecutor({
  read: (key) => Storage.getItem(key),
  write: (key, value) => Storage.setItem(key, value),
  execute: async (runId, command) => {
    const record = records.find((entry) => entry.event.id === runId);
    if (!record || !active || !userId)
      throw new Error(
        "Reopen this account on the original device to continue.",
      );
    await flushAgentWorkspace(record.request.projectId);
    if (!active || !records.includes(record))
      throw new Error("The workspace session changed.");
    const action = () => executeDeviceTool(record.request.projectId, command);
    return Object.hasOwn(workspaceTools, command.name) &&
      workspaceTools[command.name as WorkspaceToolName].mutation
      ? runAgentMutation(record.request.projectId, action, command)
      : action();
  },
});
const resume = (record: AgentTaskRecord) => {
  if (
    !active ||
    !userId ||
    !records.includes(record) ||
    finished(record) ||
    running.has(record.request.requestId)
  )
    return;
  const controller = new AbortController();
  const current = generation;
  running.set(record.request.requestId, controller);
  void (async () => {
    try {
      if (!record.accepted) {
        const accepted = await createAgentTask(
          record.request,
          controller.signal,
        );
        if (current !== generation) return;
        update(record, {
          accepted: true,
          event: { ...record.event, id: accepted.id },
          connectionError: undefined,
        });
        await persist();
      }
      // Realtime metadata can repeat a pending command after its acknowledgement.
      // Skip it within this connection, but replay the durable receipt after a
      // reconnect when delivery may be uncertain.
      const acknowledged = new Set<string>();
      for await (const event of subscribeAgentTask(
        record.event.id,
        controller.signal,
      )) {
        if (current !== generation || controller.signal.aborted) break;
        if (event.id !== record.event.id)
          throw new Error("Unexpected task update.");
        update(record, { event, connectionError: undefined });
        await persist();
        if (event.command && !acknowledged.has(event.command.tokenId)) {
          // The receipt is durable before acknowledgement, so reconnecting never
          // reruns a completed commit, push, deletion, or file write.
          const output = await execute(event.id, event.command);
          if (!controller.signal.aborted) {
            await completeAgentCommand(
              event.id,
              event.command.tokenId,
              output,
              controller.signal,
            );
            acknowledged.add(event.command.tokenId);
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && current === generation)
        update(record, {
          connectionError:
            error instanceof Error
              ? error.message
              : "Reconnecting to task updates…",
        });
    } finally {
      if (running.get(record.request.requestId) === controller)
        running.delete(record.request.requestId);
      if (active && current === generation && !finished(record)) {
        const timer = setTimeout(() => {
          if (current === generation) resume(record);
        }, 2500);
        controller.signal.addEventListener("abort", () => clearTimeout(timer), {
          once: true,
        });
      }
    }
  })();
};
export const agentTasks = {
  getSnapshot: () => records,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setSession: (owner: string | null, foreground: boolean) => {
    active = foreground && !!owner;
    if (owner !== userId || !active) {
      generation++;
      running.forEach((controller) => controller.abort());
      running.clear();
    }
    if (owner !== userId) {
      userId = owner;
      records = [];
      publish();
      const current = generation;
      hydrated = (async () => {
        if (!owner) return;
        const saved = await Storage.getItem(`codaloud.agent.tasks.${owner}`);
        if (current !== generation || owner !== userId) return;
        const schema = z
          .array(
            z.object({
              request: agentTaskRequestSchema,
              requestKey: z.string(),
              event: agentTaskEventSchema,
              accepted: z.boolean(),
            }),
          )
          .max(50);
        const parsed = schema.safeParse(JSON.parse(saved ?? "[]"));
        if (parsed.success) {
          records = parsed.data;
          publish();
        }
      })();
    }
    void hydrated
      .then(() => {
        if (active) records.forEach(resume);
      })
      .catch(() => {});
  },
  enqueue: (projectId: string, instruction: string, requestKey: string) => {
    const requestedOwner = userId;
    const admission = admissions.then(async () => {
      if (requestedOwner !== userId) throw new Error("Your session changed.");
      await hydrated;
      const owner = userId;
      if (!owner || !active)
        throw new Error("Sign in and keep the app open to start a task.");
      const existing = records.find((entry) => entry.requestKey === requestKey);
      if (existing)
        return { id: existing.event.id, accepted: existing.accepted };
      if (records.filter((record) => !finished(record)).length >= 5)
        throw new Error(
          "Five tasks are already running. Wait for one to finish.",
        );
      await flushAgentWorkspace(projectId);
      const revision = await readWorkspaceRevision(projectId);
      let deviceId = await Storage.getItem("codaloud.agent.device-id");
      if (!deviceId) {
        deviceId = randomUUID();
        await Storage.setItem("codaloud.agent.device-id", deviceId);
      }
      if (owner !== userId || !active)
        throw new Error("Your session changed. Please try again.");
      const input = agentTaskRequestSchema.parse({
        requestId: randomUUID(),
        projectId,
        deviceId,
        revision,
        instruction,
      });
      const record: AgentTaskRecord = {
        request: input,
        requestKey,
        accepted: false,
        event: {
          id: input.requestId,
          status: "queued",
          logs: ["Sending your request"],
          command: null,
        },
      };
      records = records.filter((entry) => !finished(entry));
      records.push(record);
      publish();
      // Persist the request ID before contacting the backend. An uncertain POST is
      // resumed using the same idempotency key, not submitted as another job.
      await persist();
      try {
        const accepted = await createAgentTask(
          input,
          AbortSignal.timeout(12000),
        );
        if (owner !== userId) throw new Error("Your session changed.");
        update(record, {
          accepted: true,
          event: { ...record.event, id: accepted.id },
        });
        await persist();
        resume(record);
        return { id: accepted.id, accepted: true };
      } catch (error) {
        update(record, {
          connectionError: "Couldn’t confirm acceptance yet. Reconnecting…",
        });
        resume(record);
        throw error;
      }
    });
    admissions = admission.then(
      () => {},
      () => {},
    );
    return admission;
  },
};
