import Storage from "expo-sqlite/kv-store";
import { z } from "zod";
import {
  agentPlanSchema,
  agentTaskRequestSchema,
  type AgentPlanSchema,
} from "./schemas";
import { agentTasks } from "./task-runtime";

let userId: string | null = null;
let active = false;
let generation = 0;
let records: AgentPlanSchema[] = [];
let snapshot: AgentPlanSchema[] = [];
let operations = Promise.resolve();
let hydrated = Promise.resolve();
const listeners = new Set<() => void>();
const publish = () => {
  snapshot = records.filter((plan) => !plan.resolved);
  listeners.forEach((listener) => listener());
};
const serialize = <T>(action: (assertCurrent: () => void) => Promise<T>) => {
  const owner = userId;
  const current = generation;
  const ready = hydrated;
  const assertCurrent = () => {
    if (!owner || owner !== userId || current !== generation || !active)
      throw new Error("Reopen this account to review the plan.");
  };
  const next = operations.then(async () => {
    await ready;
    assertCurrent();
    return action(assertCurrent);
  });
  operations = next.then(
    () => {},
    () => {},
  );
  return next;
};
const save = async (next: AgentPlanSchema[], assertCurrent: () => void) => {
  assertCurrent();
  await Storage.setItem(`codaloud.agent.plans.${userId}`, JSON.stringify(next));
  assertCurrent();
  records = next;
  publish();
};
const find = (requestKey: string) => {
  const plan = records.find((entry) => entry.requestKey === requestKey);
  if (!plan) throw new Error("This plan is no longer available.");
  return plan;
};
const replace = (plan: AgentPlanSchema) =>
  records.map((entry) => (entry.requestKey === plan.requestKey ? plan : entry));

export const agentPlans = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setSession: (owner: string | null, foreground: boolean) => {
    active = foreground && !!owner;
    if (owner === userId) return;
    userId = owner;
    const current = ++generation;
    records = [];
    publish();
    const pendingWrites = operations;
    hydrated = (async () => {
      if (!owner) return;
      await pendingWrites;
      const saved = await Storage.getItem(`codaloud.agent.plans.${owner}`);
      const parsed = z
        .array(agentPlanSchema)
        .max(100)
        .parse(JSON.parse(saved ?? "[]"));
      if (current !== generation) return;
      records = parsed;
      publish();
    })();
    // Keep a failed hydration rejected for mutations, without an unhandled rejection.
    void hydrated.catch(() => {});
  },
  propose: (
    projectId: string,
    instruction: string,
    requestKey: string,
    title: string,
  ) =>
    serialize(async (assertCurrent) => {
      const existing = records.find((entry) => entry.requestKey === requestKey);
      if (existing)
        return { reviewRequired: !existing.resolved, accepted: false };
      if (snapshot.length >= 5)
        throw new Error("Review or discard a pending plan first.");
      const plan = agentPlanSchema.parse({
        projectId,
        instruction,
        requestKey,
        title,
      });
      const retained =
        records.length >= 100
          ? records.filter(
              (entry) =>
                !entry.resolved ||
                entry !== records.find((item) => item.resolved),
            )
          : records;
      await save([...retained, plan], assertCurrent);
      return { reviewRequired: true, accepted: false };
    }),
  updateDetails: (requestKey: string, details: string) =>
    serialize(async (assertCurrent) => {
      const plan = find(requestKey);
      if (plan.resolved || plan.submissionInstruction) return;
      await save(
        replace(agentPlanSchema.parse({ ...plan, details })),
        assertCurrent,
      );
    }),
  discard: (requestKey: string) =>
    serialize(async (assertCurrent) => {
      const plan = find(requestKey);
      if (plan.submissionInstruction)
        throw new Error("This plan was approved. Check its task status.");
      await save(replace({ ...plan, resolved: true }), assertCurrent);
    }),
  approve: (requestKey: string, details: string) =>
    serialize(async (assertCurrent) => {
      let plan = find(requestKey);
      if (plan.resolved) return;
      if (!plan.submissionInstruction) {
        const validated = agentPlanSchema.parse({
          ...plan,
          details: details.trim(),
        });
        const submissionInstruction =
          agentTaskRequestSchema.shape.instruction.parse(
            validated.details
              ? `${plan.instruction}\n\n## User corrections and additional details\nThese take precedence over the plan above.\n${validated.details}`
              : plan.instruction,
          );
        plan = { ...validated, submissionInstruction };
        await save(replace(plan), assertCurrent);
      }
      // The existing queue persists a stable request ID and retries uncertain POSTs.
      // Repeated approval uses that same identity and never changes its instruction.
      assertCurrent();
      await agentTasks.enqueue(
        plan.projectId,
        plan.submissionInstruction!,
        plan.requestKey,
        plan.title,
      );
      await save(replace({ ...plan, resolved: true }), assertCurrent);
    }),
};
