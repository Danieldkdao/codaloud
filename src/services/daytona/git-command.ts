import { sandboxGitLockRuntime } from "./git-lock-command";
import { sandboxCommandInput } from "./create-command";

// Shared sandbox runtime. Operation snippets receive argument-safe Git helpers;
// provider output and credentials never become public API error messages.
export const sandboxGitRuntime = sandboxCommandInput + sandboxGitLockRuntime + String.raw`
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const workspace = input.repositoryPath;
const gitDirectory = path.join(workspace, ".git");
let mutationStarted = false;
let temporary;
const deadline = Date.now() + 80000;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.startsWith("GIT_") && !key.startsWith("CODALOUD_") && !/^(?:https?|all)_proxy$/i.test(key)));
Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true", GIT_MERGE_AUTOEDIT: "no" });
if (input.author) Object.assign(env, { GIT_AUTHOR_NAME: input.author.name, GIT_AUTHOR_EMAIL: input.author.email, GIT_COMMITTER_NAME: input.author.name, GIT_COMMITTER_EMAIL: input.author.email });
const options = ["--no-pager", "--no-replace-objects",
  "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "core.splitIndex=false",
  "-c", "core.untrackedCache=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false",
  "-c", "credential.helper=", "-c", "protocol.allow=never", "-c", "submodule.recurse=false",
  "-c", "commit.gpgSign=false", "-c", "tag.gpgSign=false", "-c", "core.pager=cat"];
const git = (args, cwd = workspace, extraEnv = {}) => execFileSync("git", [...options, ...args], {
  cwd, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: Math.max(1, deadline - Date.now()), killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024, stdio: "pipe",
});
const optional = (args) => { try { return git(args).trim() || null; } catch (error) { if (error.status === 1) return null; throw error; } };
const head = () => optional(["rev-parse", "--verify", "--quiet", "HEAD"]);
const branch = () => { const ref = optional(["symbolic-ref", "--quiet", "HEAD"]); return ref?.startsWith("refs/heads/") ? ref.slice(11) : null; };
const ensureIdle = () => {
  for (const name of ["MERGE_HEAD", "REVERT_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply", "sequencer", "BISECT_START"]) {
    if (fs.existsSync(path.join(gitDirectory, name))) fail("GIT_OPERATION_IN_PROGRESS");
  }
  if (git(["ls-files", "--unmerged", "-z"])) fail("GIT_CONFLICTS");
};
let capturedState;
const checkExpected = () => {
  const state = capturedState ?? { branchName: input.expectedBranch, headSha: input.expectedHeadSha };
  if (!state.branchName || branch() !== state.branchName || head() !== state.headSha) fail("WORKSPACE_CHANGED");
};
// Called inside the repository lock, so the operation uses the branch checked out
// when it starts. Later checks compare against this server-captured state.
const captureCurrentState = () => {
  capturedState = { branchName: branch(), headSha: head() };
  if (!capturedState.branchName || !capturedState.headSha) fail("GIT_BRANCH_REQUIRED");
  checkExpected();
  return capturedState;
};
const ensureClean = () => { if (git(["status", "--porcelain=v1", "--untracked-files=all"])) fail("GIT_DIRTY_WORKTREE"); };
const counts = () => {
  const currentBranch = branch();
  const headSha = head();
  const isShallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  let upstream = null;
  let upstreamSha = null;
  if (currentBranch) {
    const tracking = git(["for-each-ref", "--format=%(upstream)", "refs/heads/" + currentBranch]).trim();
    if (tracking) {
      upstream = tracking.startsWith("refs/remotes/") ? tracking.slice(13) : tracking;
      upstreamSha = optional(["rev-parse", "--verify", "--quiet", tracking + "^{commit}"]);
    }
  }
  let outgoing = null, incoming = null;
  if (headSha && upstreamSha && !isShallow) {
    [outgoing, incoming] = git(["rev-list", "--left-right", "--count", headSha + "..." + upstreamSha]).trim().split(/\s+/).map(Number);
  }
  return { currentBranch, headSha, upstream, upstreamSha, outgoing, incoming, isShallow, observedAt: new Date().toISOString() };
};
const initialize = () => {
  for (const directory of [workspace, gitDirectory]) {
    const info = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!info?.isDirectory() || info.isSymbolicLink()) fail("GIT_REPOSITORY_UNAVAILABLE");
  }
  for (const name of ["HEAD", "index", "config", "objects", "refs", "logs", "info", "packed-refs", "shallow"]) {
    if (fs.lstatSync(path.join(gitDirectory, name), { throwIfNoEntry: false })?.isSymbolicLink()) fail("GIT_REPOSITORY_UNAVAILABLE");
  }
  for (const name of ["commondir", "objects/info/alternates", "objects/info/http-alternates", "info/sparse-checkout", "info/grafts"]) {
    if (fs.existsSync(path.join(gitDirectory, name))) fail("GIT_UNSUPPORTED_CONFIG");
  }
  const config = git(["config", "--local", "--no-includes", "--name-only", "--list"]).split("\n");
  if (config.some((key) => /^(include\.|includeif\.|branch\..*\.mergeoptions$|uploadpack\.|receive\.|filter\.|merge\..*\.driver$|diff\..*\.(command|textconv)$|extensions\.|core\.(worktree|bare|sshcommand|gitproxy|alternaterefscommand)$)/i.test(key) && key !== "core.bare")) fail("GIT_UNSUPPORTED_CONFIG");
  if (fs.realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !== fs.realpathSync(workspace) ||
    fs.realpathSync(git(["rev-parse", "--absolute-git-dir"]).trim()) !== fs.realpathSync(gitDirectory)) fail("GIT_REPOSITORY_UNAVAILABLE");
  for (const name of ["index.lock", "HEAD.lock", "config.lock", "packed-refs.lock", "shallow.lock"]) {
    if (fs.existsSync(path.join(gitDirectory, name))) fail("GIT_BUSY");
  }
};
`;

export const createGitOperationCommand = (operation: string) => sandboxGitRuntime + String.raw`
try {
  const result = withGitOperationLock(workspace, () => {
  initialize();
  const run = () => { ` + operation + String.raw` };
  return run();
  });
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  const known = ["GIT_BUSY", "GIT_UNSUPPORTED_CONFIG", "GIT_REPOSITORY_UNAVAILABLE", "WORKSPACE_CHANGED", "GIT_OPERATION_IN_PROGRESS", "GIT_CONFLICTS", "GIT_DIRTY_WORKTREE", "GIT_BRANCH_EXISTS", "GIT_BRANCH_REQUIRED", "GIT_STASH_NOT_FOUND", "GIT_STASH_CHANGED", "INVALID_STASH_CURSOR", "GIT_MERGE_MAINLINE_REQUIRED", "GIT_REMOTE_REQUIRED", "GIT_REMOTE_MISMATCH", "GIT_REMOTE_REJECTED", "GIT_REMOTE_FAILED", "GIT_UPSTREAM_REQUIRED", "GIT_HISTORY_INCOMPLETE", "GIT_RESULT_TOO_LARGE"];
  process.stdout.write(JSON.stringify({ code: known.includes(error.code) ? error.code : mutationStarted ? "GIT_OUTCOME_UNKNOWN" : "GIT_REQUEST_FAILED" }));
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
`;
