import { z } from "zod";
import { projectBranchNameSchema } from "../actions/branch-schemas";
import { commitHashSchema } from "../actions/commit-schemas";

export const gitDiscardPreviewSchema = z.object({ currentBranch: projectBranchNameSchema, headSha: commitHashSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), changedPaths: z.array(z.string()).max(10000) });
export type GitDiscardPreviewSchema = z.infer<typeof gitDiscardPreviewSchema>;
export const gitDiscardSchema = z.strictObject({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.literal(true), includeUntracked: z.boolean() });
export type GitDiscardSchema = z.infer<typeof gitDiscardSchema>;
export const gitDiscardedSchema = z.object({ headSha: commitHashSchema, remainingChanges: z.boolean() });
export type GitDiscardedSchema = z.infer<typeof gitDiscardedSchema>;
