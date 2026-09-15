import { sandboxCommandInput } from "./create-command";

// Commit the staged snapshot without rereading files that the editor may change.
export const sandboxCommitChangesCommand = sandboxCommandInput + String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
let publicationAttempted = false;
const run = () => {
  const workspace = input.repositoryPath;
  const gitDirectory = path.join(workspace, ".git");
  for (const directory of [workspace, gitDirectory]) {
    const info = fs.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("WORKSPACE_CHANGED");
  }
  for (const name of ["HEAD", "index", "config", "objects", "refs"]) {
    if (fs.lstatSync(path.join(gitDirectory, name), { throwIfNoEntry: false })?.isSymbolicLink()) fail("WORKSPACE_CHANGED");
  }
  for (const name of ["commondir", "objects/info/alternates", "objects/info/http-alternates", "info/sparse-checkout"]) {
    if (fs.existsSync(path.join(gitDirectory, name))) fail("WORKSPACE_CHANGED");
  }
  const checkOperations = () => {
    for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"]) {
      if (fs.existsSync(path.join(gitDirectory, name))) fail("COMMIT_UNRESOLVED_CONFLICTS");
    }
  };
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, {
    GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: input.author.name, GIT_AUTHOR_EMAIL: input.author.email,
    GIT_COMMITTER_NAME: input.author.name, GIT_COMMITTER_EMAIL: input.author.email,
  });
  const options = ["--no-pager", "--no-replace-objects", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.splitIndex=false", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false"];
  const deadline = Date.now() + 10000;
  const git = (args, alternateIndex, stdin) => {
    if (Date.now() >= deadline) fail("COMMIT_FAILED");
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(execFileSync("git", [...options, ...args], {
      cwd: workspace, env: alternateIndex ? { ...env, GIT_INDEX_FILE: alternateIndex } : env,
      input: stdin, timeout: Math.max(1, deadline - Date.now()), maxBuffer: 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }));
  };
  if (fs.realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !== fs.realpathSync(workspace) ||
      fs.realpathSync(git(["rev-parse", "--absolute-git-dir"]).trim()) !== fs.realpathSync(gitDirectory)) fail("WORKSPACE_CHANGED");
  const branchRef = "refs/heads/" + input.currentBranch;
  const head = () => {
    try { return git(["rev-parse", "--verify", "--quiet", "HEAD"]).trim(); }
    catch (error) { if (error.status === 1) return null; throw error; }
  };
  const checkCheckout = (expectedHead = input.headSha) => {
    let actualRef;
    try { actualRef = git(["symbolic-ref", "--quiet", "--no-recurse", "HEAD"]).trim(); }
    catch (error) { if (error.status === 1) fail("WORKSPACE_CHANGED"); throw error; }
    if (actualRef !== branchRef || head() !== expectedHead) fail("WORKSPACE_CHANGED");
    // A branch alias must never be replaced by a direct ref as a side effect.
    try { git(["symbolic-ref", "--quiet", branchRef]); fail("WORKSPACE_CHANGED"); }
    catch (error) { if (error.status !== 1) throw error; }
  };
  const indexPath = path.join(gitDirectory, "index");
  const readIndex = () => {
    const info = fs.lstatSync(indexPath, { throwIfNoEntry: false });
    if (!info?.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024) fail("COMMIT_INDEX_CHANGED");
    const bytes = fs.readFileSync(indexPath);
    if (createHash("sha256").update(bytes).digest("hex") !== input.indexFingerprint) fail("COMMIT_INDEX_CHANGED");
    return bytes;
  };
  const locks = [];
  let temporary;
  try {
    // Cooperate with Git's staging and checkout locks while preparing the commit.
    for (const name of ["index.lock", "HEAD.lock"]) {
      const lockPath = path.join(gitDirectory, name);
      let fd;
      try { fd = fs.openSync(lockPath, "wx", 0o600); }
      catch (error) { if (error.code === "EEXIST") fail("COMMIT_BUSY"); throw error; }
      locks.push({ fd, lockPath });
    }
    checkCheckout();
    checkOperations();
    const index = readIndex();
    temporary = fs.mkdtempSync(path.join(gitDirectory, "codaloud-commit-"));
    const alternateIndex = path.join(temporary, "index");
    fs.writeFileSync(alternateIndex, index);
    if (git(["ls-files", "--unmerged", "-z"], alternateIndex)) fail("COMMIT_UNRESOLVED_CONFLICTS");
    const stagedPaths = git(["diff", "--cached", "--name-only", "--no-renames", "--no-ext-diff", "--no-textconv", "-z"], alternateIndex).split("\0").filter(Boolean);
    const selected = new Set(input.stagedPaths);
    if (!selected.size || selected.size !== input.stagedPaths.length || stagedPaths.length !== selected.size || stagedPaths.some((name) => !selected.has(name))) fail("COMMIT_INDEX_CHANGED");
    const tree = git(["write-tree"], alternateIndex).trim();
    const parents = input.headSha ? ["-p", input.headSha] : [];
    const hash = git(["commit-tree", tree, ...parents, "--no-gpg-sign", "-F", "-"], alternateIndex, input.message + "\n").trim();
    readIndex();
    checkCheckout();
    checkOperations();
    // update-ref acquires HEAD.lock itself. Keep index.lock held during this
    // handoff so ordinary checkouts and staging cannot change the snapshot.
    const headLock = locks.pop();
    fs.closeSync(headLock.fd);
    fs.rmSync(headLock.lockPath);
    // Compare-and-swap prevents a competing branch update from being overwritten.
    // After this request starts, an error cannot prove that no commit was published.
    publicationAttempted = true;
    git(["update-ref", "--no-deref", "-m", "commit: " + input.message.split("\n")[0], branchRef, hash, input.headSha ?? ""]);
    checkCheckout(hash);
    return { hash, currentBranch: input.currentBranch, parentHash: input.headSha };
  } finally {
    for (const { fd, lockPath } of locks.reverse()) {
      fs.closeSync(fd);
      fs.rmSync(lockPath, { force: true });
    }
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
};
try { process.stdout.write(JSON.stringify(run())); }
catch (error) {
  const known = ["WORKSPACE_CHANGED", "COMMIT_UNRESOLVED_CONFLICTS", "COMMIT_INDEX_CHANGED", "COMMIT_BUSY"];
  process.stdout.write(JSON.stringify({ code: publicationAttempted ? "COMMIT_OUTCOME_UNKNOWN" : known.includes(error.code) ? error.code : "COMMIT_FAILED" }));
  process.exitCode = 1;
}
`;
