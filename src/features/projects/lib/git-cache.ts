import type { QueryClient } from "@tanstack/react-query";

export const refreshProjectGitQueries = async (
  queryClient: QueryClient,
  workspace: { projectId: string | null | undefined } | undefined,
  { remote = false }: { remote?: boolean } = {},
) => {
  if (!workspace?.projectId) return;
  const { projectId } = workspace;
  const snapshots = [
    ["projects", "commits", "infinite", "cursor", projectId],
    ["projects", "branches", "infinite", "cursor", projectId],
    ["projects", "file-search", "infinite", projectId],
    ["projects", "stashes", "infinite", projectId],
    ["projects", "discard-preview", projectId],
  ];
  const documents = ["file", "files", "changes", "git-counts", "commit-details", "detail"]
    .map((resource) => ["projects", resource, projectId]);
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
      // Repository IDs are not available to every Git hook. Refresh the
      // remote branch pickers, which can include the branch just pushed or fetched.
      predicate: ({ queryKey }) => queryKey[0] === "github" && queryKey[1] === "repositories" &&
        queryKey[3] === "branches",
    })] : []),
  ]);
};
