import type { QueryClient } from "@tanstack/react-query";

export const refreshProjectGitQueries = async (
  queryClient: QueryClient,
  workspace: { userId: string | null; projectId: string | null | undefined } | undefined,
  { remote = false }: { remote?: boolean } = {},
) => {
  if (!workspace?.userId || !workspace.projectId) return;
  const { userId, projectId } = workspace;
  const snapshots = [
    ["projects", "commits", "infinite", "cursor", userId, projectId],
    ["projects", "branches", "infinite", "cursor", userId, projectId],
    ["projects", "file-search", "infinite", userId, projectId],
    ["projects", "stashes", "infinite", userId, projectId],
    ["projects", "discard-preview", userId, projectId],
  ];
  const documents = ["file", "files", "changes", "git-counts", "commit-details", "detail"]
    .map((resource) => ["projects", resource, userId, projectId]);
  // Reset cursor/confirmation snapshots, including inactive queries. Cancel initial
  // reads too, so a response started before the mutation cannot restore stale data.
  // Cache failures must not overwrite the actual mutation outcome.
  await Promise.allSettled([
    ...snapshots.map(async (queryKey) => {
      await queryClient.cancelQueries({ queryKey });
      await queryClient.resetQueries({ queryKey });
    }),
    ...documents.map(async (queryKey) => {
      await queryClient.cancelQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey });
    }),
    ...(remote ? [queryClient.resetQueries({
      // Repository IDs are not available to every Git hook. Refresh this account's
      // remote branch pickers, which can include the branch just pushed or fetched.
      predicate: ({ queryKey }) => queryKey[0] === "github" && queryKey[1] === "repositories" &&
        queryKey[3] === "branches" && queryKey[6] === userId,
    })] : []),
  ]);
};
