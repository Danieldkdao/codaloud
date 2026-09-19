import { requireGitIdentity } from "@/features/settings/git-identity";
import { getGitHubAccessToken } from "@/services/github/credentials";
import {
  executeWorkspace,
  LocalWorkspaceError,
} from "@/services/local-workspace/execute";
import { requireLocalProject } from "./access";
import {
  readLocalBranches,
  readLocalHistory,
  readLocalStashes,
} from "./git-readers";

import type { ProjectGitCommand } from "./git-types";

const requireAccessToken = async () => {
  try { return await getGitHubAccessToken(); }
  catch (error) {
    throw new LocalWorkspaceError("GITHUB_RECONNECT_REQUIRED", error instanceof Error ? error.message : "Connect GitHub in Settings.");
  }
};

export const executeProjectGit = async (projectId: string, command: ProjectGitCommand) => {
  const project = await requireLocalProject(projectId);
  switch (command.operation) {
    case "branches": return readLocalBranches(project.id, command.args);
    case "history": return readLocalHistory(project.id, command.args);
    case "stashes": return readLocalStashes(project.id, command.args);
    case "git/counts":
    case "git/changes":
    case "git/discard-preview":
      return executeWorkspace(project.id, command.operation);
    case "git/commit-details": return executeWorkspace(project.id, command.operation, command.args);
    case "git/checkout": return executeWorkspace(project.id, command.operation, command.args);
    case "git/create-branch": return executeWorkspace(project.id, command.operation, command.args);
    case "git/stash-apply": return executeWorkspace(project.id, command.operation, command.args);
    case "git/stash-drop": return executeWorkspace(project.id, command.operation, command.args);
    case "git/discard": return executeWorkspace(project.id, command.operation, command.args);
    case "git/undo": return executeWorkspace(project.id, command.operation, command.args);
    case "git/commit": return executeWorkspace(project.id, command.operation, { ...command.args, identity: await requireGitIdentity() });
    case "git/stash-save": return executeWorkspace(project.id, command.operation, { ...command.args, identity: await requireGitIdentity() });
    case "git/revert": return executeWorkspace(project.id, command.operation, { ...command.args, identity: await requireGitIdentity() });
    case "git/fetch": return executeWorkspace(project.id, command.operation, { accessToken: await requireAccessToken() });
    case "git/push": return executeWorkspace(project.id, command.operation, { ...command.args, accessToken: await requireAccessToken() });
    case "git/pull": return executeWorkspace(project.id, command.operation, { ...command.args, identity: await requireGitIdentity(), accessToken: await requireAccessToken() });
    default: {
      const exhaustive: never = command;
      throw new Error(`Unsupported Git command: ${exhaustive}`);
    }
  }
};
