import type { AgentCommandSchema } from "./schemas";

// Flushing is an execution prerequisite only. No open file, selection, or tab
// content is included in the model prompt.
const editors = new Map<string, () => Promise<void>>();
export const registerAgentWorkspace = (
  projectId: string,
  flush: () => Promise<void>,
) => {
  editors.set(projectId, flush);
  return () => {
    if (editors.get(projectId) === flush) editors.delete(projectId);
  };
};
export const flushAgentWorkspace = async (projectId: string) => {
  await editors.get(projectId)?.();
};

type MutationRunner = <T>(
  action: () => Promise<T>,
  command?: AgentCommandSchema,
) => Promise<T>;
const mutations = new Map<string, MutationRunner>();
export const registerAgentMutation = (
  projectId: string,
  run: MutationRunner,
) => {
  mutations.set(projectId, run);
  return () => {
    if (mutations.get(projectId) === run) mutations.delete(projectId);
  };
};
export const runAgentMutation = <T>(
  projectId: string,
  action: () => Promise<T>,
  command?: AgentCommandSchema,
) => mutations.get(projectId)?.(action, command) ?? action();
