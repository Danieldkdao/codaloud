import { sandboxCommandInput } from "./create-command";
import { sandboxFileContentCommand } from "./file-content-command";

// Executed in Daytona. Git owns status and blob identities; patches compare
// captured bytes so filters, textconv, and concurrent file replacements cannot
// substitute content while Git is rendering a diff.
export const sandboxChangesCommand = sandboxCommandInput + String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const validateName = (name) => {
  if (!name || name === "." || name === ".." || name.toLowerCase() === ".git" || /[\/\0]/.test(name)) fail("UNSUPPORTED_PATH");
};
${sandboxFileContentCommand}
const deadline = Date.now() + 8000;
const maxFileBytes = 1024 * 1024;
const maxPatchBytes = 256 * 1024;
const maxResponseBytes = 8 * 1024 * 1024;
const checkTime = () => { if (Date.now() >= deadline) fail("CHANGES_UNAVAILABLE"); };
const decode = (bytes) => {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail("UNSUPPORTED_PATH"); }
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const unavailable = (reason) => ({ patch: null, additions: null, deletions: null, unavailableReason: reason });
const run = () => {
  const workspace = path.join(input.home, ".codaloud", "workspace");
  const empty = () => ({ repositoryState: "not-initialized", currentBranch: null, headSha: null, isDetached: false, observedAt: new Date().toISOString(), changes: [] });
  for (const directory of [path.join(input.home, ".codaloud"), workspace]) {
    const info = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!info) { if (input.allowEmptyRepository) return empty(); fail("WORKSPACE_UNAVAILABLE"); }
    if (!info.isDirectory() || info.isSymbolicLink()) fail("WORKSPACE_UNAVAILABLE");
  }
  const gitDirectory = path.join(workspace, ".git");
  const gitInfo = fs.lstatSync(gitDirectory, { throwIfNoEntry: false });
  if (!gitInfo) { if (input.allowEmptyRepository) return empty(); fail("WORKSPACE_UNAVAILABLE"); }
  if (!gitInfo.isDirectory() || gitInfo.isSymbolicLink()) fail("WORKSPACE_UNAVAILABLE");
  // External worktrees/object stores are not supported by this project reader.
  for (const name of ["commondir", "objects/info/alternates", "objects/info/http-alternates"]) {
    if (fs.existsSync(path.join(gitDirectory, name))) fail("WORKSPACE_UNAVAILABLE");
  }
  for (const name of ["HEAD", "index", "config", "objects", "refs"]) {
    if (fs.lstatSync(path.join(gitDirectory, name), { throwIfNoEntry: false })?.isSymbolicLink()) fail("WORKSPACE_UNAVAILABLE");
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
  const options = ["--no-pager", "--no-replace-objects", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", "core.quotePath=true"];
  const execute = (args, cwd = workspace, maxBuffer = maxResponseBytes, allowDifference = false) => {
    checkTime();
    try {
      return execFileSync("git", [...options, ...args], { cwd, env, timeout: Math.max(1, deadline - Date.now()), killSignal: "SIGKILL", maxBuffer, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      if (allowDifference && error.status === 1 && !error.signal && !error.code) return error.stdout;
      throw error;
    }
  };
  const git = (args) => decode(execute(args));
  if (fs.realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !== fs.realpathSync(workspace)) fail("WORKSPACE_UNAVAILABLE");
  if (fs.realpathSync(git(["rev-parse", "--absolute-git-dir"]).trim()) !== fs.realpathSync(gitDirectory)) fail("WORKSPACE_UNAVAILABLE");
  // status itself can invoke clean/process filters. Disable every configured
  // filter before reading it; --no-ext-diff alone does not disable filters.
  let filterKeys = "";
  try { filterKeys = git(["config", "--null", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process|required)$"]); }
  catch (error) { if (error.status !== 1) throw error; }
  for (const key of filterKeys.split("\0").filter(Boolean)) options.push("-c", key + (key.endsWith(".required") ? "=false" : "="));
  const status = () => git(["status", "--porcelain=v2", "--branch", "--untracked-files=all", "--ignore-submodules=none", "--renames", "-z"]);
  const indexFingerprint = () => {
    const file = path.join(gitDirectory, "index");
    const info = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!info) return null;
    if (!info.isFile() || info.isSymbolicLink()) fail("WORKSPACE_UNAVAILABLE");
    if (info.size > 32 * 1024 * 1024) fail("CHANGES_TOO_LARGE");
    return hash(fs.readFileSync(file));
  };
  const beforeIndex = indexFingerprint();
  const beforeStatus = status();
  const result = { repositoryState: "ready", currentBranch: null, headSha: null, isDetached: false, observedAt: "", changes: [] };
  const records = beforeStatus.split("\0");
  if (records.pop() !== "") fail("CHANGES_UNAVAILABLE");
  const entries = [];
  const state = (value) => {
    switch (value) {
      case ".": return "unchanged";
      case "M": return "modified";
      case "A": return "added";
      case "D": return "deleted";
      case "R": return "renamed";
      case "C": return "copied";
      case "T": return "type-changed";
      case "U": return "unmerged";
      case "?": return "untracked";
      default: fail("CHANGES_UNAVAILABLE");
    }
  };
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.startsWith("# ")) {
      if (record.startsWith("# branch.oid ")) {
        const oid = record.slice(13);
        if (oid === "(initial)") result.repositoryState = "unborn";
        else result.headSha = oid;
      }
      if (record.startsWith("# branch.head ")) {
        const branch = record.slice(14);
        result.isDetached = branch === "(detached)";
        result.currentBranch = result.isDetached ? null : branch;
      }
      continue;
    }
    const kind = record[0];
    const fieldCount = kind === "1" ? 8 : kind === "2" ? 9 : kind === "u" ? 10 : kind === "?" ? 1 : 0;
    if (!fieldCount) fail("CHANGES_UNAVAILABLE");
    const fields = [];
    let offset = 0;
    for (let field = 0; field < fieldCount; field++) {
      const end = record.indexOf(" ", offset);
      if (end < 0) fail("CHANGES_UNAVAILABLE");
      fields.push(record.slice(offset, end)); offset = end + 1;
    }
    const nestedRepository = kind === "?" && record.endsWith("/");
    const filePath = nestedRepository ? record.slice(offset, -1) : record.slice(offset);
    const originalPath = kind === "2" ? records[++index] : null;
    for (const name of [filePath, originalPath].filter((name) => name !== null)) {
      if (typeof name !== "string" || Buffer.byteLength(name) > 4096) fail("UNSUPPORTED_PATH");
      name.split("/").forEach(validateName);
    }
    const untracked = kind === "?";
    const conflicted = kind === "u";
    const modes = untracked ? ["000000", "000000", nestedRepository ? "160000" : "100644"] : conflicted ? ["000000", "000000", fields[6]] : fields.slice(3, 6);
    entries.push({
      path: filePath, originalPath, indexStatus: state(untracked ? "." : fields[1][0]), worktreeStatus: state(untracked ? "?" : fields[1][1]),
      isUntracked: untracked, isConflicted: conflicted,
      kind: modes.includes("160000") ? "submodule" : modes.includes("120000") ? "symlink" : "file",
      headMode: modes[0], indexMode: modes[1], worktreeMode: modes[2],
      headOid: untracked || conflicted ? null : fields[6], indexOid: untracked || conflicted ? null : fields[7],
    });
    if (entries.length > 5000) fail("CHANGES_TOO_LARGE");
  }
  const readBlob = (oid) => {
    if (!oid || /^0+$/.test(oid)) return { bytes: null };
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) fail("CHANGES_UNAVAILABLE");
    const size = Number(git(["cat-file", "-s", oid]).trim());
    if (!Number.isSafeInteger(size) || size < 0) fail("CHANGES_UNAVAILABLE");
    if (size > maxFileBytes) return { reason: "too-large" };
    return { bytes: execute(["cat-file", "blob", oid], workspace, maxFileBytes + 1) };
  };
  const fingerprints = new Map();
  const inspectWorktree = (entry, content) => {
    const parts = entry.path.split("/");
    const name = parts.pop();
    try { return withWorkspaceFile({ ...input, parentPath: parts.join("/"), name }, (_, target) => {
      const info = fs.lstatSync(target, { throwIfNoEntry: false });
      const fingerprint = info ? [info.dev, info.ino, info.mode, info.size, info.mtimeMs, info.ctimeMs].join(":") : "missing";
      if (!content) return fingerprint;
      fingerprints.set(entry.path, fingerprint);
      if (!info) { if (entry.worktreeStatus === "deleted") return { bytes: null }; fail("WORKSPACE_CHANGED"); }
      if (info.isSymbolicLink()) { entry.kind = "symlink"; entry.worktreeMode = "120000"; return { reason: "unsupported" }; }
      if (!info.isFile()) return { reason: "unsupported" };
      entry.worktreeMode = info.mode & 0o111 ? "100755" : "100644";
      try {
        const file = readContent(target, { parentPath: parts.join("/"), name, maxBytes: maxFileBytes });
        return { bytes: Buffer.from(file.content, "utf8") };
      } catch (error) {
        if (error.code === "FILE_TOO_LARGE") return { reason: "too-large" };
        if (error.code === "UNSUPPORTED_FILE_ENCODING") return { reason: "binary" };
        if (["FILE_CHANGED", "FILE_NOT_FOUND", "INVALID_PATH"].includes(error.code)) fail("WORKSPACE_CHANGED");
        throw error;
      }
    }); } catch (error) {
      if (error.code === "WORKSPACE_NOT_READY" && (entry.worktreeStatus === "deleted" || !content)) {
        if (content) fingerprints.set(entry.path, "missing");
        return content ? { bytes: null } : "missing";
      }
      throw error;
    }
  };
  let temporary;
  let responseBytes = 1024;
  const patch = (base, target, entry, staged) => {
    if (base.reason || target.reason) return unavailable(base.reason || target.reason);
    for (const bytes of [base.bytes, target.bytes]) {
      if (!bytes) continue;
      if (bytes.includes(0)) return unavailable("binary");
      try { decode(bytes); } catch { return unavailable("binary"); }
    }
    if (!temporary) temporary = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "codaloud-diff-"));
    if (base.bytes) {
      fs.writeFileSync(path.join(temporary, "base"), base.bytes);
      fs.chmodSync(path.join(temporary, "base"), (staged ? entry.headMode : entry.indexMode) === "100755" ? 0o755 : 0o644);
    }
    if (target.bytes) {
      fs.writeFileSync(path.join(temporary, "target"), target.bytes);
      fs.chmodSync(path.join(temporary, "target"), (staged ? entry.indexMode : entry.worktreeMode) === "100755" ? 0o755 : 0o644);
    }
    let output;
    try {
      output = decode(execute(["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/", "--", base.bytes ? "base" : "/dev/null", target.bytes ? "target" : "/dev/null"], temporary, maxPatchBytes, true));
    } catch (error) {
      if (error.code === "ENOBUFS") return unavailable("too-large");
      throw error;
    }
    const baseName = "a/" + (staged ? entry.originalPath || entry.path : entry.path);
    const targetName = "b/" + entry.path;
    const quote = (name) => /[\s"\\]/.test(name) ? JSON.stringify(name) : name;
    output = output.replace(/^diff --git .*$/m, () => "diff --git " + quote(baseName) + " " + quote(targetName))
      .replace(/^--- a\/base$/m, () => "--- " + quote(baseName))
      .replace(/^\+\+\+ b\/target$/m, () => "+++ " + quote(targetName));
    if (Buffer.byteLength(output) > maxPatchBytes) return unavailable("too-large");
    let additions = 0, deletions = 0, inHunk = false;
    for (const line of output.split("\n")) {
      if (line.startsWith("@@ ")) inHunk = true;
      else if (inHunk && line.startsWith("+")) additions++;
      else if (inHunk && line.startsWith("-")) deletions++;
    }
    return { patch: output, additions, deletions, unavailableReason: null };
  };
  try {
    for (const entry of entries) {
      checkTime();
      let staged = null, unstaged = null;
      const hasStaged = entry.indexStatus !== "unchanged";
      const hasUnstaged = entry.worktreeStatus !== "unchanged";
      if (entry.isConflicted || entry.kind !== "file") {
        const reason = entry.isConflicted ? "conflict" : "unsupported";
        if (hasStaged) staged = unavailable(reason);
        if (hasUnstaged) unstaged = unavailable(reason);
      } else {
        const index = readBlob(entry.indexOid);
        if (hasStaged) staged = patch(readBlob(entry.headOid), index, entry, true);
        if (hasUnstaged) unstaged = patch(index, inspectWorktree(entry, true), entry, false);
      }
      const { headOid, indexOid, ...change } = entry;
      const complete = { ...change, staged, unstaged };
      responseBytes += Buffer.byteLength(JSON.stringify(complete)) + 1;
      if (responseBytes > maxResponseBytes) fail("CHANGES_TOO_LARGE");
      result.changes.push(complete);
    }
    if (status() !== beforeStatus || indexFingerprint() !== beforeIndex) fail("WORKSPACE_CHANGED");
    for (const [filePath, fingerprint] of fingerprints) {
      checkTime();
      if (inspectWorktree({ path: filePath }, false) !== fingerprint) fail("WORKSPACE_CHANGED");
    }
    result.observedAt = new Date().toISOString();
    return result;
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
};
try {
  const output = JSON.stringify(run());
  if (Buffer.byteLength(output) > maxResponseBytes) fail("CHANGES_TOO_LARGE");
  process.stdout.write(output);
} catch (error) {
  const known = ["WORKSPACE_UNAVAILABLE", "WORKSPACE_CHANGED", "CHANGES_TOO_LARGE", "UNSUPPORTED_PATH"];
  process.stdout.write(JSON.stringify({ code: known.includes(error.code) ? error.code : error.code === "ENOBUFS" ? "CHANGES_TOO_LARGE" : "CHANGES_UNAVAILABLE" }));
  process.exitCode = 1;
}
`;
