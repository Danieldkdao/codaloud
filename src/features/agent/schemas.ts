import { z } from "zod";
export const agentTaskStatuses = [
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
] as const;
export type AgentTaskStatus = (typeof agentTaskStatuses)[number];
export const agentTaskRequestSchema = z.strictObject({
  requestId: z.uuid(),
  projectId: z.uuid(),
  deviceId: z.uuid(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  instruction: z.string().trim().min(1).max(4000),
  // Older persisted tasks can still be opened after updating the app.
  title: z.string().trim().min(1).max(80).default("Workspace task"),
});
export type AgentTaskRequestSchema = z.infer<typeof agentTaskRequestSchema>;
export const agentTaskPayloadSchema = agentTaskRequestSchema.extend({
  userId: z.string().min(1).max(256),
});
export type AgentTaskPayloadSchema = z.infer<typeof agentTaskPayloadSchema>;
export const agentToolResultSchema = z.object({
  ok: z.boolean(),
  text: z.string().max(10000),
  revision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  truncated: z.boolean().default(false),
});
export type AgentToolResultSchema = z.infer<typeof agentToolResultSchema>;
export const agentCommandSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  tokenId: z.string().min(1).max(256),
});
export type AgentCommandSchema = z.infer<typeof agentCommandSchema>;
export const agentTaskEventSchema = z.object({
  id: z.string().min(1).max(256),
  status: z.enum(agentTaskStatuses),
  logs: z.array(z.string().max(300)).max(64),
  summary: z.string().max(3000).optional(),
  command: agentCommandSchema.nullable().default(null),
});
export type AgentTaskEventSchema = z.infer<typeof agentTaskEventSchema>;
