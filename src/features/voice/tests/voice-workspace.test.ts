import { afterEach, expect, it, vi } from "vitest";
import { inlineSession } from "../inline-session";
import {
  encodeVoicePayload,
  getVoiceContext,
  readVoiceWorkspace,
} from "../voice-workspace";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  list: vi.fn(),
  analyze: vi.fn(),
}));
vi.mock("@/features/projects/actions/code-intelligence-actions", () => ({
  readProjectCodeIntelligence: mocks.analyze,
}));
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
  mocks.analyze.mockResolvedValue({
    diagnostics: [
      {
        from: 8,
        to: 14,
        code: 2304,
        severity: "error",
        message: "Unknown name",
      },
    ],
  });
  expect(getVoiceContext(request).mode).toBe("quick-edit");
  expect(
    await readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "a.ts", offset: 8, length: 6 },
    }),
  ).toMatchObject({
    content: "needle",
    source: "editor",
    diagnostics: {
      status: "ready",
      items: [expect.objectContaining({ code: 2304 })],
    },
  });
  expect(mocks.analyze).toHaveBeenCalledWith("p", {
    path: "a.ts",
    content: "unsaved needle",
  });
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
it("rejects diagnostics that arrive after the voice request is cancelled", async () => {
  const { request, unregister } = await begin();
  mocks.analyze.mockImplementationOnce(async () => {
    inlineSession.cancel();
    return { diagnostics: [] };
  });
  await expect(
    readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "a.ts" },
    }),
  ).rejects.toThrow(/cancel/i);
  unregister();
});
it("keeps the file readable when its diagnostics are unavailable", async () => {
  const { request, unregister } = await begin();
  mocks.analyze.mockResolvedValueOnce(null);
  expect(
    await readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "a.ts" },
    }),
  ).toMatchObject({
    content: "unsaved needle",
    diagnostics: { status: "unavailable", total: null },
  });
  unregister();
});
it("fits diagnostic metadata beside long Unicode paths without breaking read pagination", async () => {
  const { request, unregister } = await begin();
  const path =
    Array.from({ length: 34 }, () => "界".repeat(80)).join("/") +
    "/" +
    "界".repeat(20) +
    "/a.ts";
  mocks.read.mockResolvedValueOnce({ content: "界".repeat(1200) });
  mocks.analyze.mockResolvedValueOnce({ diagnostics: [] });
  const result = await readVoiceWorkspace("p", {
    id: request.id,
    name: "readFile",
    args: { path },
  });
  expect(() => encodeVoicePayload(result)).not.toThrow();
  expect(result).toHaveProperty("content");
  if ("content" in result) {
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.nextOffset).toBe(result.content.length);
  }
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
