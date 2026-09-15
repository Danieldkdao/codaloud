import { sandboxCommandInput } from "./create-command";

// Keep the real index untouched until every selected path has staged successfully.
export const sandboxStageChangesCommand = sandboxCommandInput + String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
let indexPublished = false;
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
    if (fs.existsSync(path.join(gitDirectory, name))) fail("COMMIT_UNSUPPORTED_FILE");
  }
  for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"]) {
    if (fs.existsSync(path.join(gitDirectory, name))) fail("COMMIT_UNRESOLVED_CONFLICTS");
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
  const options = ["--no-pager", "--no-replace-objects", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", "core.splitIndex=false"];
  const deadline = Date.now() + 10000;
  const git = (args, alternateIndex, stdin) => {
    if (Date.now() >= deadline) fail("COMMIT_STAGING_FAILED");
    const output = execFileSync("git", [...options, ...args], {
      cwd: workspace, env: alternateIndex ? { ...env, GIT_INDEX_FILE: alternateIndex } : env,
      input: stdin, timeout: Math.max(1, deadline - Date.now()), maxBuffer: 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(output);
  };
  if (fs.realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !== fs.realpathSync(workspace) ||
      fs.realpathSync(git(["rev-parse", "--absolute-git-dir"]).trim()) !== fs.realpathSync(gitDirectory)) fail("WORKSPACE_CHANGED");
  // Status may run clean filters. Suppress them during inspection; selected
  // filter-managed files are rejected below rather than staged as raw content.
  let filterKeys = "";
  try { filterKeys = git(["config", "--null", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process|required)$"]); }
  catch (error) { if (error.status !== 1) throw error; }
  for (const key of filterKeys.split("\0").filter(Boolean)) options.push("-c", key + (key.endsWith(".required") ? "=false" : "="));
  const branch = () => {
    try { return git(["symbolic-ref", "--quiet", "--short", "HEAD"]).trim(); }
    catch (error) { if (error.status === 1) return null; throw error; }
  };
  const head = () => {
    try { return git(["rev-parse", "--verify", "--quiet", "HEAD"]).trim(); }
    catch (error) { if (error.status === 1) return null; throw error; }
  };
  const checkCheckout = () => { if (branch() !== input.currentBranch || head() !== input.headSha) fail("WORKSPACE_CHANGED"); };
  const status = () => git(["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none", "--no-renames", "-z"]);
  const staged = (index) => git(["diff", "--cached", "--name-only", "--no-renames", "--no-ext-diff", "--no-textconv", "-z"], index).split("\0").filter(Boolean);
  const indexPath = path.join(gitDirectory, "index");
  const readIndex = () => {
    const info = fs.lstatSync(indexPath, { throwIfNoEntry: false });
    if (!info) return null;
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024) fail("COMMIT_STAGING_FAILED");
    return fs.readFileSync(indexPath);
  };
  const lockPath = indexPath + ".lock";
  let lock;
  try { lock = fs.openSync(lockPath, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") fail("COMMIT_STAGING_BUSY"); throw error; }
  let temporary;
  let published = false;
  try {
    checkCheckout();
    const beforeIndex = readIndex();
    const beforeStatus = status();
    const records = new Map(beforeStatus.split("\0").filter(Boolean).map((record) => [record.slice(3), record.slice(0, 2)]));
    if ([...records.values()].some((state) => state.includes("U") || state === "AA" || state === "DD")) fail("COMMIT_UNRESOLVED_CONFLICTS");
    const selected = new Set(input.paths);
    if (!selected.size || selected.size !== input.paths.length) fail("COMMIT_SELECTION_CHANGED");
    if (staged().some((name) => !selected.has(name))) fail("COMMIT_UNSELECTED_STAGED_CHANGES");
    const fingerprints = new Map();
    const inspect = (name) => {
      const parts = name.split("/");
      if (parts.some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git" || part.includes("\0"))) fail("COMMIT_UNSUPPORTED_FILE");
      let target = workspace;
      for (let i = 0; i < parts.length; i++) {
        target = path.join(target, parts[i]);
        const info = fs.lstatSync(target, { throwIfNoEntry: false });
        if (!info) return "missing";
        if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile())) fail("COMMIT_UNSUPPORTED_FILE");
        if (i === parts.length - 1) return [info.dev, info.ino, info.mode, info.size, info.mtimeMs, info.ctimeMs].join(":");
      }
    };
    for (const name of selected) {
      const state = records.get(name);
      if (!state) fail("COMMIT_SELECTION_CHANGED");
      const fingerprint = inspect(name);
      if (fingerprint === "missing" && !state.includes("D")) fail("COMMIT_SELECTION_CHANGED");
      fingerprints.set(name, fingerprint);
    }
    const attrs = git(["check-attr", "-z", "--stdin", "filter"], undefined, input.paths.join("\0") + "\0").split("\0");
    for (let i = 2; i < attrs.length; i += 3) {
      if (attrs[i] !== "unspecified" && attrs[i] !== "unset") fail("COMMIT_UNSUPPORTED_FILTER");
    }
    temporary = fs.mkdtempSync(path.join(gitDirectory, "codaloud-stage-"));
    const alternateIndex = path.join(temporary, "index");
    if (beforeIndex) fs.writeFileSync(alternateIndex, beforeIndex);
    const tracked = new Set(git(["ls-files", "-z"]).split("\0").filter(Boolean));
    // Already-staged deletions have no worktree or index entry to add again.
    const pathsToAdd = input.paths.filter((name) => tracked.has(name) || fingerprints.get(name) !== "missing");
    if (pathsToAdd.length) git(["add", "--all", "--pathspec-from-file=-", "--pathspec-file-nul"], alternateIndex, pathsToAdd.join("\0") + "\0");
    checkCheckout();
    const stagedPaths = staged(alternateIndex);
    if (stagedPaths.length !== selected.size || stagedPaths.some((name) => !selected.has(name))) fail("COMMIT_SELECTION_CHANGED");
    checkCheckout();
    const afterIndex = readIndex();
    if (status() !== beforeStatus || (beforeIndex === null ? afterIndex !== null : !afterIndex?.equals(beforeIndex))) fail("WORKSPACE_CHANGED");
    for (const [name, fingerprint] of fingerprints) if (inspect(name) !== fingerprint) fail("WORKSPACE_CHANGED");
    const updatedIndex = fs.readFileSync(alternateIndex);
    fs.writeFileSync(lock, updatedIndex);
    fs.fsyncSync(lock);
    fs.closeSync(lock); lock = undefined;
    fs.renameSync(lockPath, indexPath);
    published = true;
    indexPublished = true;
    const indexFingerprint = require("node:crypto").createHash("sha256").update(updatedIndex).digest("hex");
    return { stagedPaths, currentBranch: input.currentBranch, headSha: input.headSha, indexFingerprint };
  } finally {
    if (lock !== undefined) fs.closeSync(lock);
    if (!published) fs.rmSync(lockPath, { force: true });
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
};
try { process.stdout.write(JSON.stringify(run())); }
catch (error) {
  const known = ["WORKSPACE_CHANGED", "COMMIT_UNRESOLVED_CONFLICTS", "COMMIT_UNSUPPORTED_FILE", "COMMIT_UNSUPPORTED_FILTER", "COMMIT_STAGING_BUSY", "COMMIT_SELECTION_CHANGED", "COMMIT_UNSELECTED_STAGED_CHANGES"];
  process.stdout.write(JSON.stringify({ code: indexPublished ? "COMMIT_STAGING_OUTCOME_UNKNOWN" : known.includes(error.code) ? error.code : "COMMIT_STAGING_FAILED" }));
  process.exitCode = 1;
}
`;
