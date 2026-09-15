import { createGitOperationCommand } from "./git-command";

export const sandboxGitStashViewCommand = createGitOperationCommand(String.raw`
  const start = input.index ?? input.offset;
  const limit = input.index === undefined ? input.pageSize : 1;
  const fields = git(["stash", "list", "--skip=" + start, "--max-count=" + (limit + 1), "--format=%H%x00%gs%x00%aI", "-z"]).split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 3) fail("GIT_REQUEST_FAILED");
  const stashes = [];
  for (let index = 0; index < fields.length; index += 3) {
    stashes.push({ index: start + index / 3, sha: fields[index], message: fields[index + 1], createdAt: fields[index + 2] });
  }
  const nextOffset = stashes.length > limit ? start + limit : null;
  stashes.length = Math.min(stashes.length, limit);
  let patch = null;
  if (input.index !== undefined) {
    if (!stashes.length) fail("GIT_STASH_NOT_FOUND");
    if (stashes[0].sha !== input.stashSha) fail("GIT_STASH_CHANGED");
    patch = git(["stash", "show", "--patch", "--include-untracked", "--no-ext-diff", "--no-textconv", "--no-color", input.stashSha]);
    if (Buffer.byteLength(patch) > 3 * 1024 * 1024) fail("GIT_RESULT_TOO_LARGE");
  }
  return { stashes, nextOffset: input.index === undefined ? nextOffset : null, patch };
`);
