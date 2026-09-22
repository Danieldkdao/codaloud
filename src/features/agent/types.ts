import type { AgentTaskEventSchema, AgentTaskRequestSchema } from "./schemas";
export type AgentTaskRecord = {
  request: AgentTaskRequestSchema;
  requestKey: string;
  event: AgentTaskEventSchema;
  accepted: boolean;
  connectionError?: string;
};
