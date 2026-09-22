import {
  agentToolResultSchema,
  type AgentCommandSchema,
  type AgentToolResultSchema,
} from "./schemas";

export const createDeviceExecutor = (dependencies: {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<unknown>;
  execute: (
    runId: string,
    command: AgentCommandSchema,
  ) => Promise<AgentToolResultSchema>;
}) => {
  const pending = new Map<string, Promise<AgentToolResultSchema>>();
  return (runId: string, command: AgentCommandSchema) => {
    const key = `codaloud.agent.receipt.${runId}.${command.id}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const result = (async () => {
      const saved = await dependencies.read(key);
      if (saved) {
        const receipt = JSON.parse(saved);
        if (receipt.state === "done")
          return agentToolResultSchema.parse(receipt.result);
        // A crash may occur after Git succeeds but before the success is saved.
        // Never guess and repeat a potentially destructive operation.
        return agentToolResultSchema.parse({
          ok: false,
          text: "The previous operation's outcome is unknown. Inspect the workspace before requesting it again.",
        });
      }
      await dependencies.write(key, JSON.stringify({ state: "started" }));
      let output: AgentToolResultSchema;
      try {
        output = agentToolResultSchema.parse(
          await dependencies.execute(runId, command),
        );
      } catch (error) {
        output = {
          ok: false,
          text:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "The action failed.",
          truncated: false,
        };
      }
      await dependencies.write(
        key,
        JSON.stringify({ state: "done", result: output }),
      );
      return output;
    })().finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  };
};
