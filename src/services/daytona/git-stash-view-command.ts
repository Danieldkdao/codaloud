import { createGitOperationCommand } from "./git-command";

export const sandboxGitStashViewCommand = createGitOperationCommand(String.raw`
  const start = input.index ?? input.offset;
  const limit = input.index === undefined ? input.pageSize : 1;
  const args = ["stash", "list", "--skip=" + start, "--max-count=" + (limit + 1), "--format=%gd%x00%H%x00%gs%x00%aI", "-z"];
  // Git applies reflog message filtering before skip/count; use literal matching.
  if (input.search) args.push("--fixed-strings", "--regexp-ignore-case", "--grep-reflog=" + input.search);
  const fields = git(args).split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 4) fail("GIT_REQUEST_FAILED");
  const stashes = [];
  for (let index = 0; index < fields.length; index += 4) {
    // A filtered page's position is not its stash slot; preserve the Git selector.
    const selector = /^stash@\{(\d+)\}$/.exec(fields[index]);
    if (!selector || !Number.isSafeInteger(Number(selector[1]))) fail("GIT_REQUEST_FAILED");
    stashes.push({ index: Number(selector[1]), sha: fields[index + 1], message: fields[index + 2], createdAt: fields[index + 3] });
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
