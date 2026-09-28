import { z } from "zod";
import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";
export const fileActivityStatuses = [
  "reading",
  "read",
  "proposed",
  "changed",
  "failed",
] as const;
export type FileActivityStatus = (typeof fileActivityStatuses)[number];
export const fileActivitySchema = z.object({
  path: projectFilePathSchema,
  status: z.enum(fileActivityStatuses),
});
export type FileActivitySchema = z.infer<typeof fileActivitySchema>;
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
export const agentPlanSchema = z.object({
  requestKey: z.string().min(1).max(512),
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(1).max(3000),
  details: z.string().max(800).default(""),
  resolved: z.boolean().default(false),
  // Freeze the exact approved request before handing it to the durable task queue.
  submissionInstruction: agentTaskRequestSchema.shape.instruction.optional(),
});
export type AgentPlanSchema = z.infer<typeof agentPlanSchema>;
export const agentTaskPayloadSchema = agentTaskRequestSchema.extend({
  userId: z.string().min(1).max(256),
});
export type AgentTaskPayloadSchema = z.infer<typeof agentTaskPayloadSchema>;
export const agentToolResultSchema = z.object({
  changedFiles: z.array(projectFilePathSchema).max(100).optional(),
  ok: z.boolean(),
  code: z.string().max(100).optional(),
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
