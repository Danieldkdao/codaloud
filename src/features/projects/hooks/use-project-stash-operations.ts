import { useProjectStashes } from "./use-project-stashes";
import { useProjectGitOperation } from "./use-project-git-operation";
import type { GitStashListSchema } from "../server/git-stash-schemas";
import { formatProjectStashResult } from "../lib/formatters";

export const useProjectStashOperations = () => {
  const operation = useProjectGitOperation();
  const stashes = useProjectStashes(operation.projectId, {
    enabled: false,
    pageSize: 1,
  });
  const stashAll = () =>
    operation.run(
      "Stashing changes…",
      async (assertCurrent) => {
        if (
          !(await operation.confirm(
            "Stash all changes?",
            "Save tracked and untracked changes in a stash and clear them from this workspace. Ignored files are kept.",
            "Stash All",
          ))
        )
          return null;
        assertCurrent();
        return stashes.gitStash.mutateAsync({});
      },
      { changesFiles: true, success: formatProjectStashResult },
    );

  const pop = (selected?: GitStashListSchema["stashes"][number]) =>
    operation.run(
      "Restoring stash…",
      async (assertCurrent) => {
        const stash =
          selected ??
          (await stashes.refetch({ throwOnError: true })).data?.pages[0]
            ?.stashes[0];
        assertCurrent();
        if (!stash) throw new Error("There are no saved stashes to restore.");
        if (
          !(await operation.confirm(
            "Pop stash?",
            `Restore “${stash.message}” into ${operation.branch ?? "the current branch"}? The stash is removed only after it applies successfully.`,
            "Pop Stash",
          ))
        )
          return null;
        assertCurrent();
        return stashes.gitPopStash.mutateAsync({
          stashIndex: stash.index,
          stashSha: stash.sha,
          restoreIndex: false,
        });
      },
      {
        changesFiles: true,
        success: (result) => (result ? "Stash restored." : null),
      },
    );
  return { stashAll, pop, operation };
};
