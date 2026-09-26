import { z } from "zod";

export const explanationRequestSchema = z.object({
  path: z.string().min(1).max(1024),
  selected: z
    .string()
    .min(1)
    .max(24000)
    .refine((value) => Boolean(value.trim())),
  before: z.string().max(1000),
  after: z.string().max(1000),
});
export type ExplanationRequestSchema = z.infer<typeof explanationRequestSchema>;
export const explanationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string().max(16000) }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string().max(500) }),
]);
export type ExplanationEventSchema = z.infer<typeof explanationEventSchema>;
