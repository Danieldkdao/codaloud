import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ require: vi.fn(), execute: vi.fn(), search: vi.fn() }));
vi.mock("../local/access", () => ({ requireLocalProject: mocks.require }));
vi.mock("../local/file-search", () => ({ searchLocalFiles: mocks.search }));
vi.mock("@/services/local-workspace/execute", () => ({ executeWorkspace: mocks.execute, LocalWorkspaceError: class extends Error { constructor(readonly code: string, message: string) { super(message); } } }));
import { LocalWorkspaceError } from "@/services/local-workspace/execute";
import { readProjectFileContentAction, readProjectFilesAction, saveProjectFileContentAction } from "../actions/file-actions";
beforeEach(() => { vi.resetAllMocks(); mocks.require.mockResolvedValue({ id: "project" }); });
it("reads files directly from the owned native workspace", async () => {
  mocks.execute.mockResolvedValue({ path: "a.txt", content: "hi", size: 2 });
  expect(await readProjectFileContentAction("project", "a.txt")).toEqual({ path: "a.txt", content: "hi", size: 2 });
  expect(mocks.execute).toHaveBeenCalledWith("project", "read-file", { path: "a.txt" });
});
it("never reaches files for a missing project", async () => {
  mocks.require.mockRejectedValue(new Error("Missing"));
  expect(await readProjectFilesAction("missing")).toBeNull();
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("preserves native conflict codes for editor recovery", async () => {
  mocks.execute.mockRejectedValue(new LocalWorkspaceError("FILE_CHANGED", "Reload first"));
  expect(await saveProjectFileContentAction("project", { path: "a.txt", content: "new", expectedContentHash: "a".repeat(64) }))
    .toMatchObject({ error: true, code: "FILE_CHANGED" });
});
it("does not read files after cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  expect(await readProjectFileContentAction("project", "a.txt", controller.signal)).toBeNull();
  expect(mocks.execute).not.toHaveBeenCalled();
});
