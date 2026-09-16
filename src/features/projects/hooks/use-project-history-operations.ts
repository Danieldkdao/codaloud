import { useProjectGitOperation } from "./use-project-git-operation";
import { useProjectCommitHistory } from "./use-project-commit-history";
import { useProjectChanges } from "./use-project-changes";
import type { GitUndoMode } from "../server/git-undo-schemas";
import { formatCommitSubject, formatProjectUndoMode } from "../lib/formatters";

export const useProjectHistoryOperations = () => {
  const operation = useProjectGitOperation();
  const history = useProjectCommitHistory(operation.projectId, { enabled: false, branch: operation.branch ?? undefined, source: "local", pageSize: 1 });
  const changes = useProjectChanges(operation.projectId, { enabled: false });
  const readHead = async () => {
    const page = (await history.refetch({ throwOnError: true })).data?.pages[0];
    const commit = page?.commits[0];
    if (!commit) throw new Error("There is no commit to change on this branch.");
    return commit;
  };
  const undo = (mode: GitUndoMode) => operation.run("Undoing last commit…", async (assertCurrent) => {
    const commit = await readHead();
    assertCurrent();
    if (!commit.parentHashes.length) throw new Error("The initial commit cannot be undone. Use Revert to reverse its changes.");
    const presentation = formatProjectUndoMode(mode);
    if (!await operation.confirm("Undo last commit?", `${formatCommitSubject(commit.message)}\n\n${presentation.description}\nIf already pushed, prefer Revert to preserve shared history.`, "Undo Commit", mode === "hard")) return null;
    assertCurrent();
    const fresh = await readHead();
    assertCurrent();
    if (fresh.hash !== commit.hash) throw new Error("The last commit changed. Review it before trying again.");
    return history.gitUndoLastCommit.mutateAsync({ mode });
  }, { changesFiles: true, success: (result) => result ? formatProjectUndoMode(mode).success : null });

  const revert = () => operation.run("Reverting last commit…", async (assertCurrent) => {
    const commit = await readHead();
    assertCurrent();
    const merge = commit.parentHashes.length > 1;
    if (!await operation.confirm("Revert last commit?", `Create a new commit reversing “${formatCommitSubject(commit.message)}”.${merge ? " This merge will be reversed relative to its first parent." : ""} Existing history is preserved.`, "Revert Commit")) return null;
    assertCurrent();
    const fresh = await readHead();
    assertCurrent();
    if (fresh.hash !== commit.hash) throw new Error("The last commit changed. Review it before trying again.");
    return history.gitRevertLastCommit.mutateAsync(merge ? { mainline: 1 } : {});
  }, { changesFiles: true, success: (result) => result ? "Revert commit created." : null });

  const discard = (includeUntracked: boolean) => operation.run("Discarding changes…", async (assertCurrent) => {
    const preview = (await changes.discardPreview.refetch({ throwOnError: true })).data;
    assertCurrent();
    if (!preview) throw new Error("Unable to check changes. Refresh and try again.");
    if (!preview.changedPaths.length) throw new Error("There are no changes to discard.");
    const description = includeUntracked
      ? "Discard all tracked changes and delete untracked files? Ignored files are kept."
      : "Discard all tracked changes? Untracked and ignored files are kept.";
    if (!await operation.confirm("Discard changes?", `${description} These changes cannot be restored from the app.`, "Discard Changes", true)) return null;
    assertCurrent();
    return changes.gitDiscardChanges.mutateAsync({ fingerprint: preview.fingerprint, confirm: true, includeUntracked });
  }, { changesFiles: true, success: (result) => result ? result.remainingChanges ? "Changes discarded. Some files still have changes." : "Changes discarded." : null });
  return { operation, undo, revert, discard };
};
