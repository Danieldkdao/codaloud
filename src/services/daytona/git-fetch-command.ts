import { createGitOperationCommand } from "./git-command";
import { sandboxGitRemoteRuntime } from "./git-remote-command";

export const sandboxGitFetchCommand = createGitOperationCommand(sandboxGitRemoteRuntime + String.raw`
  checkExpected();
  prepareRemote();
  fetchRemote();
  return counts();
`);
