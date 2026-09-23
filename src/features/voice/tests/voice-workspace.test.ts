import { afterEach, expect, it, vi } from "vitest";
import { inlineSession } from "../inline-session";
import { getVoiceContext, readVoiceWorkspace } from "../voice-workspace";
const mocks = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn() }));
vi.mock("@/features/projects/actions/file-actions", () => ({
  readProjectFileContentAction: mocks.read,
  readProjectFilesAction: mocks.list,
}));
afterEach(() => inlineSession.cancel());
const begin = async () => {
  const unregister = inlineSession.register("p", {
    capture: async () => ({
      projectId: "p",
      branch: "main",
      openFiles: [{ path: "a.ts", content: "unsaved needle" }],
      activeFile: {
        path: "a.ts",
        documentKey: "doc",
        revision: 1,
        content: "unsaved needle",
        from: 0,
        to: 7,
        focused: true,
      },
    }),
    preview: () => {},
    apply: async () => true,
  });
  return { request: await inlineSession.begin("p"), unregister };
};
it("reads frozen unsaved contents and never exposes mutation tools", async () => {
  const { request, unregister } = await begin();
  expect(getVoiceContext(request).mode).toBe("quick-edit");
  expect(
    await readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "a.ts", offset: 8, length: 6 },
    }),
  ).toMatchObject({ content: "needle", source: "editor" });
  expect(mocks.read).not.toHaveBeenCalled();
  await expect(
    readVoiceWorkspace("p", { id: request.id, name: "saveFile", args: {} }),
  ).rejects.toThrow();
  await expect(
    readVoiceWorkspace("other", {
      id: request.id,
      name: "readFile",
      args: { path: "a.ts" },
    }),
  ).rejects.toThrow();
  inlineSession.cancel();
  await expect(
    readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "a.ts" },
    }),
  ).rejects.toThrow();
  unregister();
});
it("overlays unsaved search results and rejects late reads after cancellation", async () => {
  const { request, unregister } = await begin();
  mocks.list.mockResolvedValue({ files: [], totalCount: 0, nextCursor: null });
  expect(
    await readVoiceWorkspace("p", {
      id: request.id,
      name: "searchFiles",
      args: { search: "needle", scope: "content", path: "", pageSize: 10 },
    }),
  ).toMatchObject({ files: [expect.objectContaining({ path: "a.ts" })] });
  mocks.read.mockImplementation(async () => {
    inlineSession.cancel();
    return { content: "disk" };
  });
  await expect(
    readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "b.ts" },
    }),
  ).rejects.toThrow(/cancel/i);
  unregister();
});
it("clears tool progress and marks failed file reads without claiming a change", async () => {
  const { request, unregister } = await begin();
  mocks.read.mockResolvedValue(null);
  await expect(
    readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "missing.ts" },
    }),
  ).rejects.toThrow();
  expect(inlineSession.getSnapshot()?.files).toEqual([
    { path: "missing.ts", status: "failed" },
  ]);
  mocks.list.mockRejectedValue(new Error("offline"));
  await expect(
    readVoiceWorkspace("p", {
      id: request.id,
      name: "listFiles",
      args: { path: "" },
    }),
  ).rejects.toThrow();
  expect(inlineSession.getSnapshot()?.toolActivity).toBeUndefined();
  unregister();
});
