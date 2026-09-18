import { afterEach, beforeEach, expect, it } from "vitest";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { sandboxGitDiscardCommand, sandboxGitDiscardPreviewCommand } from "../git-discard-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); });
afterEach(() => fixture.cleanup());
const discard = (includeUntracked = false, fingerprint = fixture.run(sandboxGitDiscardPreviewCommand).fingerprint) => fixture.run(sandboxGitDiscardCommand, { confirm: true, includeUntracked, fingerprint });
it("restores index and tracked work without moving HEAD", () => {
  fixture.write("file.txt", "staged\n"); fixture.git("add", "."); fixture.write("file.txt", "unstaged\n"); fixture.write("new.txt", "keep\n");
  expect(discard()).toMatchObject({ headSha: fixture.headSha, remainingChanges: true });
  expect(readFileSync(join(fixture.repositoryPath, "file.txt"), "utf8")).toBe("base\n");
  expect(fixture.git("diff", "--cached")).toBe(""); expect(existsSync(join(fixture.repositoryPath, "new.txt"))).toBe(true);
});
it("removes untracked files only when requested, preserving ignored files and nested repositories", () => {
  fixture.write(".git/info/exclude", "ignored.txt\n"); fixture.write("ignored.txt", "keep\n"); fixture.write("new.txt", "remove\n");
  mkdirSync(join(fixture.repositoryPath, "nested")); fixture.git("-C", "nested", "init");
  discard(true);
  expect(existsSync(join(fixture.repositoryPath, "new.txt"))).toBe(false);
  expect(existsSync(join(fixture.repositoryPath, "ignored.txt"))).toBe(true);
  expect(existsSync(join(fixture.repositoryPath, "nested/.git"))).toBe(true);
});
it("refuses a changed preview even when HEAD and filenames are unchanged", () => {
  fixture.write("file.txt", "first\n"); const fingerprint = fixture.run(sandboxGitDiscardPreviewCommand).fingerprint;
  fixture.write("file.txt", "newer\n");
  expect(() => discard(false, fingerprint)).toThrow(expect.objectContaining({ code: "WORKSPACE_CHANGED" }));
  expect(fixture.git("diff")).toContain("newer");
});

it("preserves files ignored at preview time even when restoring .gitignore changes the rules", () => {
  fixture.write(".gitignore", "old-ignore\n"); fixture.git("add", ".gitignore"); fixture.git("commit", "-m", "Ignore rules");
  fixture.write(".gitignore", "precious.txt\n"); fixture.write("precious.txt", "must survive\n");
  const preview = fixture.run(sandboxGitDiscardPreviewCommand);
  fixture.run(sandboxGitDiscardCommand, { fingerprint: preview.fingerprint, confirm: true, includeUntracked: true });
  expect(readFileSync(join(fixture.repositoryPath, "precious.txt"), "utf8")).toBe("must survive\n");
});

it("discards only from the branch captured at execution", () => {
  fixture.git("switch", "-c", "feature/current");
  fixture.write("file.txt", "feature base\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Feature");
  fixture.write("file.txt", "changed\n");
  const preview = fixture.run(sandboxGitDiscardPreviewCommand);
  expect(preview).toMatchObject({ currentBranch: "feature/current", headSha: fixture.git("rev-parse", "HEAD") });
  fixture.run(sandboxGitDiscardCommand, { confirm: true, includeUntracked: false, fingerprint: preview.fingerprint });
  expect(readFileSync(join(fixture.repositoryPath, "file.txt"), "utf8")).toBe("feature base\n");
});
it("rejects a preview after switching branches even when HEAD is identical", () => {
  fixture.write("file.txt", "keep\n");
  const preview = fixture.run(sandboxGitDiscardPreviewCommand);
  fixture.git("switch", "-c", "other");
  expect(() => discard(false, preview.fingerprint)).toThrow(expect.objectContaining({ code: "WORKSPACE_CHANGED" }));
  expect(fixture.git("diff")).toContain("keep");
});
