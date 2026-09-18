import { requireGitIdentity } from "@/features/workspace/git-identity";
import { getGitHubAccessToken } from "@/services/github/credentials";
import { executeWorkspace, LocalWorkspaceError } from "@/services/local-workspace/execute";
import { requireLocalProject } from "./access";
import { readLocalBranches, readLocalHistory, readLocalStashes } from "./git-readers";

export const executeProjectGit = async (projectId: string, path: string, input: object, mutation: boolean) => {
  const project = await requireLocalProject(projectId);
  let operation = path;
  let identity, accessToken;
  if (!mutation) {
    if (path === "branches") return readLocalBranches(project.id, input);
    if (path === "commits") return readLocalHistory(project.id, input);
    if (path === "git/stash") return readLocalStashes(project.id, input);
    if (path.startsWith("commit/")) operation = "git/commit-details";
    else if (path === "changes") operation = "git/changes";
    else if (path === "git/discard") operation = "git/discard-preview";
  } else {
    switch (path) {
      case "commits": operation = "git/commit"; break;
      case "checkout": operation = "git/checkout"; break;
      case "git/branches": operation = "git/create-branch"; break;
      case "git/stash": operation = "git/stash-save"; break;
      case "git/stash-pop": operation = "git/stash-apply"; break;
    }
    if (["git/commit", "git/stash-save", "git/revert", "git/pull"].includes(operation)) identity = await requireGitIdentity();
    if (["git/fetch", "git/push", "git/pull"].includes(operation)) {
      try { accessToken = await getGitHubAccessToken(); }
      catch (error) { throw new LocalWorkspaceError("GITHUB_RECONNECT_REQUIRED", error instanceof Error ? error.message : "Connect GitHub in Settings."); }
    }
  }
  return executeWorkspace(project.id, operation, { ...input, ...(identity ? { identity } : {}), ...(accessToken ? { accessToken } : {}) });
};
