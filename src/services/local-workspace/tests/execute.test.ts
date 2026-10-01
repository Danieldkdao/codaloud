import { beforeEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../../../modules/local-workspace", () => ({ default: native }));
import { executeWorkspace } from "../execute";
import { subscribeWorkspaceChanges } from "../change-events";

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { native.execute.mockReset().mockResolvedValue(JSON.stringify({ ok: true, data: true })); });

it("serializes the operation-specific arguments across the native boundary", async () => {
  await executeWorkspace(id, "save-file", { path: "a.ts", content: "new", expectedContentHash: "a".repeat(64) });
  expect(JSON.parse(native.execute.mock.calls[0][0])).toEqual({ projectId: id, operation: "save-file", args: { path: "a.ts", content: "new", expectedContentHash: "a".repeat(64) } });
});

it("notifies open workspace views after a successful file mutation", async () => {
  const changed = vi.fn();
  const release = subscribeWorkspaceChanges(id, changed);
  await executeWorkspace(id, "read-file", { path: "a.ts" });
  expect(changed).not.toHaveBeenCalled();
  await executeWorkspace(id, "save-file", {
    path: "a.ts",
    content: "new",
    expectedContentHash: "a".repeat(64),
  });
  expect(changed).toHaveBeenCalledOnce();
  release();
});

it("validates project IDs and native failures at runtime", async () => {
  await expect(executeWorkspace("../outside", "initialize")).rejects.toThrow();
  expect(native.execute).not.toHaveBeenCalled();
  native.execute.mockResolvedValue(JSON.stringify({ ok: false, code: "FILE_CHANGED", message: "Reload first" }));
  await expect(executeWorkspace(id, "read-file", { path: "a.ts" })).rejects.toMatchObject({ code: "FILE_CHANGED" });
});

// TypeScript must reject mismatched commands even though the native wire format is JSON.
const checkCommandTypes = () => {
  // @ts-expect-error Unknown operation.
  void executeWorkspace(id, "anything");
  // @ts-expect-error Saving requires the content hash used for conflict detection.
  void executeWorkspace(id, "save-file", { path: "a.ts", content: "new" });
  // @ts-expect-error A branch name is not a file-read payload.
  void executeWorkspace(id, "read-file", { branchName: "main" });
  // @ts-expect-error Native commits require a Git author.
  void executeWorkspace(id, "git/commit", { message: "Commit", paths: ["a.ts"] });
  // @ts-expect-error No arbitrary arguments on a no-argument operation.
  void executeWorkspace(id, "initialize", { force: true });
};
void checkCommandTypes;

it("discovers archives without requiring a deleted project's ID", async () => {
  const { listArchivedWorkspaceIds } = await import("../execute");
  native.execute.mockResolvedValue(JSON.stringify({ ok: true, data: [id] }));
  expect(await listArchivedWorkspaceIds()).toEqual([id]);
  expect(JSON.parse(native.execute.mock.calls[0][0])).toEqual({ operation: "list-archived-projects" });
});
