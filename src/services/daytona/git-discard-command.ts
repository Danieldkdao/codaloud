import { createGitOperationCommand } from "./git-command";

const snapshot = String.raw`
  ensureIdle();
  if (!branch() || !head()) fail("GIT_BRANCH_REQUIRED");
  const snapshot = () => {
    const { createHash } = require("node:crypto");
    const hash = createHash("sha256");
    const add = (value) => { const bytes = Buffer.from(value); hash.update(String(bytes.length) + ":"); hash.update(bytes); };
    add(branch()); add(head());
    const indexPath = path.join(gitDirectory, "index");
    if (fs.statSync(indexPath).size > 32 * 1024 * 1024) fail("GIT_RESULT_TOO_LARGE");
    add(fs.readFileSync(indexPath));
    const changedPaths = [...new Set([
      ...git(["diff", "--name-only", "--no-renames", "--no-ext-diff", "--no-textconv", "-z"]).split("\0"),
      ...git(["diff", "--cached", "--name-only", "--no-renames", "--no-ext-diff", "--no-textconv", "-z"]).split("\0"),
      ...git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0"),
    ].filter(Boolean))].sort();
    if (changedPaths.length > 10000) fail("GIT_RESULT_TOO_LARGE");
    let total = 0;
    for (const name of changedPaths) {
      const file = path.join(workspace, name);
      if (!file.startsWith(workspace + path.sep)) fail("GIT_UNSUPPORTED_CONFIG");
      add(name);
      const info = fs.lstatSync(file, { throwIfNoEntry: false });
      if (!info) { add("deleted"); continue; }
      add(String(info.mode));
      if (info.isSymbolicLink()) { add(fs.readlinkSync(file)); continue; }
      if (info.isDirectory()) { add("directory"); continue; }
      if (!info.isFile() || !fs.realpathSync(file).startsWith(fs.realpathSync(workspace) + path.sep)) fail("GIT_UNSUPPORTED_CONFIG");
      total += info.size;
      if (total > 64 * 1024 * 1024) fail("GIT_RESULT_TOO_LARGE");
      add(fs.readFileSync(file));
    }
    return { expectedBranch: branch(), expectedHeadSha: head(), fingerprint: hash.digest("hex"), changedPaths };
  };
`;

export const sandboxGitDiscardPreviewCommand = createGitOperationCommand(snapshot + "return snapshot();");
export const sandboxGitDiscardCommand = createGitOperationCommand(snapshot + String.raw`
  checkExpected();
  if (snapshot().fingerprint !== input.fingerprint) fail("WORKSPACE_CHANGED");
  if (!input.confirm) fail("WORKSPACE_CHANGED");
  if (git(["ls-files", "--stage"]).split("\n").some((line) => line.startsWith("160000 "))) fail("GIT_UNSUPPORTED_CONFIG");
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  mutationStarted = true;
  git(["restore", "--source=" + input.expectedHeadSha, "--staged", "--worktree", "--", "."]);
  // Single force deliberately preserves nested repositories; no -x preserves ignored files.
  if (input.includeUntracked) {
    // Restoring .gitignore can expose files that were ignored in the preview.
    // Only clean the original untracked paths, in bounded argument batches.
    for (let offset = 0; offset < untracked.length; offset += 50) {
      git(["--literal-pathspecs", "clean", "-fd", "--", ...untracked.slice(offset, offset + 50)]);
    }
  }
  checkExpected();
  return { headSha: head(), remainingChanges: Boolean(git(["status", "--porcelain=v1", "--untracked-files=all"])) };
`);
