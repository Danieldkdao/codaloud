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
        const name = await operation.promptText({
          title: "Stash all changes?",
          message:
            "Name this stash to find it later, or leave the name blank. Tracked and untracked changes will be saved and cleared from this workspace. Ignored files are kept.",
          placeholder: "Stash name",
          actionText: "Stash All",
        });
        if (name === null) return null;
        assertCurrent();
        return stashes.gitStash.mutateAsync({
          message: name.trim() || undefined,
        });
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
            "Restore stash?",
            `Restore “${stash.message}” into ${operation.branch ?? "the current branch"}? The saved stash will be kept so you can restore it again.`,
            "Yes",
            false,
            "No",
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
  const remove = (stash: GitStashListSchema["stashes"][number]) =>
    operation.run(
      "Deleting stash…",
      async (assertCurrent) => {
        if (
          !(await operation.confirm(
            "Delete saved stash?",
            `Delete “${stash.message}”? This removes the saved stash permanently. Changes already restored to the workspace are kept.`,
            "Delete Stash",
            true,
          ))
        )
          return null;
        assertCurrent();
        return stashes.gitDeleteStash.mutateAsync({
          stashIndex: stash.index,
          stashSha: stash.sha,
        });
      },
      { success: (result) => (result ? "Stash deleted." : null) },
    );

  return { stashAll, pop, remove, operation };
};
