import { z } from "zod";

export const gitRevertSchema = z.strictObject({
  mainline: z.number().int().min(1).max(64).optional(),
});
export type GitRevertSchema = z.infer<typeof gitRevertSchema>;
