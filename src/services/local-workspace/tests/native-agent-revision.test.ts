import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
const executable = resolve("modules/local-workspace/build-host/workspace-cli");
const projectId = "00000000-0000-4000-8000-000000000001";
let root: string;
const call = (operation: string, args = {}, expectedRevision?: string) =>
  JSON.parse(
    execFileSync(executable, [root], {
      input: JSON.stringify({ projectId, operation, args, expectedRevision }),
      encoding: "utf8",
    }),
  );
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agent-revision-"));
  expect(call("initialize").ok).toBe(true);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
it("supports unborn repositories and rejects stale work under the native lock", () => {
  const revision = call("git/revision");
  expect(revision.ok).toBe(true);
  writeFileSync(join(root, projectId, "new.txt"), "user edit");
  expect(
    call(
      "create-file",
      { parentPath: "", name: "agent.txt", kind: "file" },
      revision.data,
    ),
  ).toMatchObject({ ok: false, code: "WORKSPACE_CHANGED" });
  const current = call("git/revision").data;
  expect(
    call(
      "create-file",
      { parentPath: "", name: "agent.txt", kind: "file" },
      current,
    ).ok,
  ).toBe(true);
  expect(readFileSync(join(root, projectId, "new.txt"), "utf8")).toBe(
    "user edit",
  );
});
it("revision changes when the branch changes without a new commit", () => {
  const initial = call("git/revision").data;
  execFileSync("git", [
    "-C",
    join(root, projectId),
    "symbolic-ref",
    "HEAD",
    "refs/heads/another",
  ]);
  expect(call("git/revision").data).not.toBe(initial);
});
