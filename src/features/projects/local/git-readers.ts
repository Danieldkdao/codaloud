import { z } from "zod";
import { executeWorkspace, LocalWorkspaceError } from "@/services/local-workspace/execute";
import { projectBranchesSchema } from "../actions/branch-schemas";
import { projectBranchParamsSchema, readProjectBranchCursor } from "../lib/branch-params";
import { projectCommitParamsSchema } from "../lib/commit-params";
import { commitHashSchema, projectCommitSchema } from "../actions/commit-schemas";
import { gitStashListSchema, gitStashQuerySchema } from "../server/git-stash-schemas";

const historyPositionSchema = z.object({
  scope: z.string(), offset: z.number().int().min(0).max(10_000_000), snapshotSha: commitHashSchema,
});
export type HistoryPositionSchema = z.infer<typeof historyPositionSchema>;
const nativeHistorySchema = z.object({
  commits: z.array(projectCommitSchema), snapshotSha: commitHashSchema.nullable(),
  nextOffset: z.number().int().nonnegative().nullable(), isShallow: z.boolean(),
});
export type NativeHistorySchema = z.infer<typeof nativeHistorySchema>;

export const readLocalBranches = async (projectId: string, input: unknown, source: "local" | "remote" = "local") => {
  const params = projectBranchParamsSchema.parse(input);
  const data = projectBranchesSchema.parse(await executeWorkspace(projectId, "git/branches", { source }));
  const position = params.cursor ? readProjectBranchCursor(params.cursor) : null;
  const matches = data.branches.filter((branch) => branch.toLowerCase().includes(params.search) && (!position || branch > position.after)).sort();
  const branches = matches.slice(0, params.pageSize);
  return { branches, currentBranch: data.currentBranch,
    nextCursor: matches.length > branches.length ? JSON.stringify({ version: 1, projectId, search: params.search, after: branches.at(-1) }) : null };
};

export const readLocalHistory = async (projectId: string, input: unknown) => {
  const params = projectCommitParamsSchema.parse(input);
  const scope = JSON.stringify([projectId, params.source, params.branch, params.search, params.author, params.pageSize]);
  const position = params.cursor ? historyPositionSchema.parse(JSON.parse(params.cursor)) : null;
  if (position && position.scope !== scope) throw new LocalWorkspaceError("INVALID_COMMIT_CURSOR", "Refresh this commit search.");
  const offset = position?.offset ?? 0;
  const data = nativeHistorySchema.parse(await executeWorkspace(projectId, "git/history", {
    branch: params.branch, source: params.source, offset, limit: 500, snapshotSha: position?.snapshotSha,
  }));
  const commits: z.infer<typeof projectCommitSchema>[] = [];
  let nextOffset = data.nextOffset;
  for (let index = 0; index < data.commits.length; index++) {
    const commit = data.commits[index];
    if ((`${commit.message} ${commit.hash}`.toLowerCase().includes(params.search)) &&
        (`${commit.author} ${commit.authorEmail}`.toLowerCase().includes(params.author))) commits.push(commit);
    if (commits.length === params.pageSize) {
      nextOffset = index + 1 < data.commits.length || data.nextOffset !== null ? offset + index + 1 : null;
      break;
    }
  }
  return { commits, snapshotSha: data.snapshotSha, isShallow: data.isShallow,
    nextCursor: nextOffset !== null && data.snapshotSha ? JSON.stringify({ scope, offset: nextOffset, snapshotSha: data.snapshotSha }) : null };
};

// A stash cursor anchors the last displayed SHA. Stash indexes may move when a
// new stash is added; consumers still submit both index and SHA for mutations.
export const readLocalStashes = async (projectId: string, input: unknown) => {
  const params = gitStashQuerySchema.parse(input);
  const stashes = z.array(gitStashListSchema.shape.stashes.element).parse(await executeWorkspace(projectId, "git/stashes"));
  const scope = JSON.stringify([projectId, params.search, params.pageSize]);
  let after = -1;
  if (params.cursor) {
    const position = z.object({ scope: z.string(), sha: commitHashSchema }).parse(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(params.cursor.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)))));
    after = stashes.findIndex((stash) => stash.sha === position.sha);
    if (position.scope !== scope || after < 0) throw new LocalWorkspaceError("INVALID_STASH_CURSOR", "Refresh the stash list.");
  }
  const matches = stashes.slice(after + 1).filter((stash) => stash.message.toLowerCase().includes(params.search.toLowerCase()));
  const page = matches.slice(0, params.pageSize);
  const nextCursor = matches.length > page.length ? btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ scope, sha: page.at(-1)!.sha })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null;
  return { stashes: page, nextCursor };
};
