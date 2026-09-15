import { createGitOperationCommand } from "./git-command";

export const sandboxGitStashViewCommand = createGitOperationCommand(String.raw`
  const crypto = require("node:crypto");
  const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
  const search = (input.search ?? "").trim().toLowerCase();
  const scope = hash(JSON.stringify([input.projectId, input.sandboxId, workspace, search, input.pageSize]));
  let cursor = null;
  if (input.cursor !== undefined) {
    try {
      if (typeof input.cursor !== "string" || input.cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error();
      cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (!cursor || Object.keys(cursor).length !== 5 || cursor.version !== 1 || cursor.scope !== scope ||
        !/^[a-f0-9]{64}$/.test(cursor.snapshot) || !Number.isSafeInteger(cursor.afterIndex) || cursor.afterIndex < 0 ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(cursor.afterSha) || input.index !== undefined) throw new Error();
    } catch { fail("INVALID_STASH_CURSOR"); }
  }

  const args = ["stash", "list", "--format=%gd%x00%H%x00%gs%x00%aI", "-z"];
  if (input.index !== undefined) args.push("--skip=" + input.index, "--max-count=1");
  // Fingerprint every list entry, including duplicate SHAs and nonmatching messages.
  // The shared Git helper bounds output to 4 MiB and enforces the command deadline.
  let raw;
  try { raw = git(args); }
  catch (error) { if (error.code === "ENOBUFS") fail("GIT_RESULT_TOO_LARGE"); throw error; }
  const snapshot = hash(raw);
  if (cursor && cursor.snapshot !== snapshot) fail("GIT_STASH_CHANGED");
  const fields = raw.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 4) fail("GIT_REQUEST_FAILED");
  const entries = [];
  for (let index = 0; index < fields.length; index += 4) {
    const selector = /^stash@\{(\d+)\}$/.exec(fields[index]);
    if (!selector || !Number.isSafeInteger(Number(selector[1]))) fail("GIT_REQUEST_FAILED");
    entries.push({ index: Number(selector[1]), sha: fields[index + 1], message: fields[index + 2], createdAt: fields[index + 3] });
  }

  if (input.index !== undefined) {
    if (!entries.length) fail("GIT_STASH_NOT_FOUND");
    if (entries[0].sha !== input.stashSha) fail("GIT_STASH_CHANGED");
    const patch = git(["stash", "show", "--patch", "--include-untracked", "--no-ext-diff", "--no-textconv", "--no-color", input.stashSha]);
    if (Buffer.byteLength(patch) > 3 * 1024 * 1024) fail("GIT_RESULT_TOO_LARGE");
    return { stashes: entries, nextCursor: null, patch };
  }

  const matches = (entry) => entry.message.toLowerCase().includes(search);
  if (cursor) {
    const anchor = entries[cursor.afterIndex];
    if (!anchor || anchor.sha !== cursor.afterSha || !matches(anchor)) fail("INVALID_STASH_CURSOR");
  }
  const stashes = [];
  for (const entry of entries) {
    if ((!cursor || entry.index > cursor.afterIndex) && matches(entry)) stashes.push(entry);
    if (stashes.length > input.pageSize) break;
  }
  const hasMore = stashes.length > input.pageSize;
  stashes.length = Math.min(stashes.length, input.pageSize);
  const last = stashes.at(-1);
  // This is a scoped position, not authorization. Every page still checks ownership.
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({
    version: 1, scope, snapshot, afterIndex: last.index, afterSha: last.sha,
  })).toString("base64url") : null;
  return { stashes, nextCursor, patch: null };
`);
