import { projectCommitDetailsLimits } from "@/features/projects/constants";
import { sandboxCommandInput } from "./create-command";

// Only immutable commit/tree/blob objects are read. User input travels as encoded data.
export const sandboxCommitDetailsCommand = sandboxCommandInput + `const limits = ${JSON.stringify(projectCommitDetailsLimits)};\n` + String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const decode = bytes => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
const unavailable = reason => ({ patch: null, additions: null, deletions: null, unavailableReason: reason });
const run = () => {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.commitSha)) fail("COMMIT_NOT_FOUND");
  const workspace = path.join(input.home, ".codaloud", "workspace");
  const gitDirectory = path.join(workspace, ".git");
  for (const directory of [path.join(input.home, ".codaloud"), workspace, gitDirectory]) {
    const info = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!info?.isDirectory() || info.isSymbolicLink()) fail("WORKSPACE_UNAVAILABLE");
  }
  for (const name of ["commondir", "objects/info/alternates", "objects/info/http-alternates"]) {
    if (fs.existsSync(path.join(gitDirectory, name))) fail("WORKSPACE_UNAVAILABLE");
  }
  for (const name of ["HEAD", "index", "config", "objects", "refs"]) {
    if (fs.lstatSync(path.join(gitDirectory, name), { throwIfNoEntry: false })?.isSymbolicLink()) fail("WORKSPACE_UNAVAILABLE");
  }
  const deadline = Date.now() + limits.commandTimeoutMs;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_NO_LAZY_FETCH: "1" });
  const options = ["--no-pager", "--no-replace-objects", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.quotePath=true"];
  const execute = (args, cwd = workspace, maxBuffer = limits.maxResponseBytes, allowDifference = false) => {
    if (Date.now() >= deadline) fail("COMMIT_DETAILS_UNAVAILABLE");
    try { return execFileSync("git", [...options, ...args], { cwd, env, timeout: Math.max(1, deadline - Date.now()), killSignal: "SIGKILL", maxBuffer, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { if (allowDifference && error.status === 1 && !error.signal && !error.code) return error.stdout; throw error; }
  };
  const git = args => decode(execute(args));
  if (fs.realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !== fs.realpathSync(workspace) ||
      fs.realpathSync(git(["rev-parse", "--absolute-git-dir"]).trim()) !== fs.realpathSync(gitDirectory)) fail("WORKSPACE_UNAVAILABLE");
  try { if (git(["cat-file", "-t", input.commitSha]).trim() !== "commit") fail("COMMIT_NOT_FOUND"); }
  catch { fail("COMMIT_NOT_FOUND"); }
  // Read actual parent headers: rev-list/log can hide parents at shallow boundaries.
  const rawCommit = git(["cat-file", "commit", input.commitSha]);
  const headerEnd = rawCommit.indexOf("\n\n");
  if (headerEnd < 0) fail("COMMIT_DETAILS_UNAVAILABLE");
  const parentHashes = rawCommit.slice(0, headerEnd).split("\n").filter(line => line.startsWith("parent ")).map(line => line.slice(7));
  if (!parentHashes.every(sha => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha))) fail("COMMIT_DETAILS_UNAVAILABLE");
  const baseSha = parentHashes[0] ?? null;
  if (baseSha) {
    try { if (git(["cat-file", "-t", baseSha]).trim() !== "commit") fail("COMMIT_PARENT_UNAVAILABLE"); }
    catch { fail("COMMIT_PARENT_UNAVAILABLE"); }
  }
  const fields = git(["show", "--no-patch", "--no-show-signature", "--no-notes", "--encoding=UTF-8", "--format=%H%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%B%x00", input.commitSha, "--"]).split("\0");
  if (fields.length !== 9 || fields[8] !== "\n") fail("COMMIT_DETAILS_UNAVAILABLE");
  const [hash, author, authorEmail, authoredAt, committer, committerEmail, committedAt, message] = fields;
  const revisions = baseSha ? [baseSha, input.commitSha] : ["--root", input.commitSha];
  const raw = git(["diff-tree", "--no-commit-id", "--raw", "--no-abbrev", "-r", "-z", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--find-renames=50%", "-l1000", ...revisions, "--"]);
  const records = raw ? raw.split("\0") : [];
  if (records.length && records.pop() !== "") fail("COMMIT_DETAILS_UNAVAILABLE");
  const files = [];
  const validatePath = name => {
    if (!name || Buffer.byteLength(name) > 4096 || name.includes("\0") || name.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) fail("UNSUPPORTED_PATH");
  };
  const status = code => {
    switch (code) {
      case "A": return "added"; case "D": return "deleted"; case "M": return "modified";
      case "R": return "renamed"; case "C": return "copied"; case "T": return "type-changed";
      default: fail("COMMIT_DETAILS_UNAVAILABLE");
    }
  };
  const blob = (oid, mode) => {
    if (mode === "000000") return { bytes: null };
    if (mode !== "100644" && mode !== "100755") return { reason: "unsupported" };
    const size = Number(git(["cat-file", "-s", oid]).trim());
    if (!Number.isSafeInteger(size) || size < 0) fail("COMMIT_DETAILS_UNAVAILABLE");
    if (size > limits.maxFileBytes) return { reason: "too-large" };
    const bytes = execute(["cat-file", "blob", oid], workspace, limits.maxFileBytes + 1);
    if (bytes.includes(0)) return { reason: "binary" };
    try { decode(bytes); } catch { return { reason: "binary" }; }
    return { bytes };
  };
  let temporary;
  let responseBytes = Buffer.byteLength(JSON.stringify(fields));
  try {
    for (let index = 0; index < records.length;) {
      if (files.length >= limits.maxFiles) fail("COMMIT_DIFF_TOO_LARGE");
      const match = /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([a-f0-9]{40}|[a-f0-9]{64}) ([ADMRTC])\d*$/.exec(records[index++]);
      if (!match) fail("COMMIT_DETAILS_UNAVAILABLE");
      const [, beforeMode, afterMode, beforeOid, afterOid, code] = match;
      let filePath = records[index++]; let originalPath = null;
      if (code === "R" || code === "C") { originalPath = filePath; filePath = records[index++]; validatePath(originalPath); }
      validatePath(filePath);
      const base = blob(beforeOid, beforeMode); const target = blob(afterOid, afterMode);
      let diff;
      if (base.reason || target.reason) diff = unavailable(base.reason || target.reason);
      else {
        if (!temporary) temporary = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "codaloud-commit-diff-"));
        for (const [name, value, mode] of [["base", base, beforeMode], ["target", target, afterMode]]) {
          if (value.bytes !== null) { fs.writeFileSync(path.join(temporary, name), value.bytes); fs.chmodSync(path.join(temporary, name), mode === "100755" ? 0o755 : 0o644); }
        }
        try {
          let patch = decode(execute(["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/", "--", base.bytes !== null ? "base" : "/dev/null", target.bytes !== null ? "target" : "/dev/null"], temporary, limits.maxPatchBytes, true));
          const quote = name => /[\s"\\]/.test(name) ? JSON.stringify(name) : name;
          const before = quote("a/" + (originalPath ?? filePath)); const after = quote("b/" + filePath);
          patch = patch.replace(/^diff --git .*$/m, () => "diff --git " + before + " " + after)
            .replace(/^--- a\/base$/m, () => "--- " + before).replace(/^\+\+\+ b\/target$/m, () => "+++ " + after);
          let additions = 0, deletions = 0, inHunk = false;
          for (const line of patch.split("\n")) {
            if (line.startsWith("@@ ")) inHunk = true;
            else if (inHunk && line.startsWith("+")) additions++;
            else if (inHunk && line.startsWith("-")) deletions++;
          }
          diff = Buffer.byteLength(patch) > limits.maxPatchBytes ? unavailable("too-large") : { patch, additions, deletions, unavailableReason: null };
        } catch (error) { if (error.code === "ENOBUFS") diff = unavailable("too-large"); else throw error; }
      }
      const file = { path: filePath, originalPath, status: status(code), beforeMode, afterMode, diff };
      responseBytes += Buffer.byteLength(JSON.stringify(file));
      if (responseBytes > limits.maxResponseBytes) fail("COMMIT_DIFF_TOO_LARGE");
      files.push(file);
    }
    const summary = { fileCount: files.length, additions: 0, deletions: 0, unavailableCount: 0 };
    for (const file of files) {
      if (file.diff.unavailableReason !== null) summary.unavailableCount++;
      else { summary.additions += file.diff.additions; summary.deletions += file.diff.deletions; }
    }
    return { source: "local", commit: { hash, author, authorEmail, authoredAt, committer, committerEmail, committedAt, message, parentHashes, isMerge: parentHashes.length > 1 }, baseSha, files, summary, githubUrl: null };
  } finally { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
};
try {
  const result = JSON.stringify(run());
  if (Buffer.byteLength(result) > limits.maxResponseBytes) fail("COMMIT_DIFF_TOO_LARGE");
  process.stdout.write(result);
} catch (error) {
  const known = ["COMMIT_NOT_FOUND", "COMMIT_PARENT_UNAVAILABLE", "WORKSPACE_UNAVAILABLE", "UNSUPPORTED_PATH", "COMMIT_DIFF_TOO_LARGE"];
  process.stdout.write(JSON.stringify({ code: known.includes(error.code) ? error.code : error.code === "ENOBUFS" ? "COMMIT_DIFF_TOO_LARGE" : "COMMIT_DETAILS_UNAVAILABLE" }));
  process.exitCode = 1;
}
`;
