import { z } from "zod";
import { gitExpectedStateSchema } from "./git-schemas";

export const gitRevertSchema = gitExpectedStateSchema.extend({ mainline: z.number().int().min(1).max(64).optional() });
export type GitRevertSchema = z.infer<typeof gitRevertSchema>;
