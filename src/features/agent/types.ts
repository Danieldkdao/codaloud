import type { AgentTaskEventSchema, AgentTaskRequestSchema } from "./schemas";
export type AgentTaskRecord = {
  request: AgentTaskRequestSchema;
  requestKey: string;
  event: AgentTaskEventSchema;
  accepted: boolean;
  // Only untouched queued tasks may inherit confirmed preceding agent writes.
  execution?: { started: boolean; revision: string };
  connectionError?: string;
};
