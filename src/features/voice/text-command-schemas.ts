import { z } from "zod";
import { voiceContextSchema, inlineEventSchema } from "./schemas";
const textPart = z.object({
  type: z.literal("text"),
  text: z.string().max(16000),
});
const toolCallPart = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string().max(256),
  toolName: z.string().max(64),
  input: z.unknown(),
});
const toolResultPart = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string().max(256),
  toolName: z.string().max(64),
  output: z.object({ type: z.literal("json"), value: z.json() }),
});
export const commandMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().min(1).max(4000) }),
  z.object({
    role: z.literal("assistant"),
    content: z.union([
      z.string().max(16000),
      z.array(z.union([textPart, toolCallPart])).max(16),
    ]),
  }),
  z.object({
    role: z.literal("tool"),
    content: z.array(toolResultPart).max(16),
  }),
]);
export type CommandMessageSchema = z.infer<typeof commandMessageSchema>;
export const textCommandRequestSchema = z.object({
  context: voiceContextSchema,
  requestId: z.uuid(),
  messages: z.array(commandMessageSchema).min(1).max(32),
  final: z.boolean().default(false),
  quickEditTarget: z
    .object({
      source: z.string().max(25600),
      offset: z.number().int().nonnegative(),
      caret: z.number().int().nonnegative(),
    })
    .optional(),
});
export type TextCommandRequestSchema = z.infer<typeof textCommandRequestSchema>;
export const textCommandResponseSchema = z.object({
  text: z.string().max(16000),
  messages: z.array(commandMessageSchema).max(16),
  toolCalls: z
    .array(
      z.object({
        toolCallId: z.string().max(256),
        toolName: z.string().max(64),
        input: z.unknown(),
      }),
    )
    .max(8),
  events: z.array(inlineEventSchema).max(128).optional(),
});
export type TextCommandResponseSchema = z.infer<
  typeof textCommandResponseSchema
>;
