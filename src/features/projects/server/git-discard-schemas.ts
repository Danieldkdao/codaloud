import { z } from "zod";
import { gitExpectedStateSchema } from "./git-schemas";
import { commitHashSchema } from "../actions/commit-schemas";

export const gitDiscardPreviewSchema = gitExpectedStateSchema.extend({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), changedPaths: z.array(z.string()).max(10000) });
export type GitDiscardPreviewSchema = z.infer<typeof gitDiscardPreviewSchema>;
export const gitDiscardSchema = gitExpectedStateSchema.extend({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.literal(true), includeUntracked: z.boolean() });
export type GitDiscardSchema = z.infer<typeof gitDiscardSchema>;
export const gitDiscardedSchema = z.object({ headSha: commitHashSchema, remainingChanges: z.boolean() });
export type GitDiscardedSchema = z.infer<typeof gitDiscardedSchema>;
