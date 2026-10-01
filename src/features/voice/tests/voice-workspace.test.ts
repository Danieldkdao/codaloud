import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  aiDisabledPaths: "",
  inlineModel: "openai/gpt-5.4-mini",
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  editorPreferencesStore: {
    load: async () => {},
    getSnapshot: () => ({
      preferences: {
        aiDisabledPaths: mocks.aiDisabledPaths,
        inlineModel: mocks.inlineModel,
      },
    }),
  },
}));
vi.mock("@/features/projects/actions/code-intelligence-actions", () => ({
  readProjectCodeIntelligence: mocks.analyze,
}));
vi.mock("@/features/projects/actions/file-actions", () => ({
  readProjectFileContentAction: mocks.read,
  readProjectFilesAction: mocks.list,
}));
afterEach(() => inlineSession.cancel());
beforeEach(() => {
  mocks.aiDisabledPaths = "";
  mocks.inlineModel = "openai/gpt-5.4-mini";
});
const begin = async (mode?: "agent") => {
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
  return { request: await inlineSession.begin("p", mode), unregister };
};

it("supplies the exact whole-file save hash with every agent read excerpt", async () => {
  const { request, unregister } = await begin("agent");
  try {
    mocks.analyze.mockResolvedValue({ diagnostics: [] });
    const result = await readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "a.ts", offset: 8, length: 6 },
    });
    expect(result).toMatchObject({
      content: "needle",
      contentHash: createHash("sha256")
        .update("unsaved needle", "utf8")
        .digest("hex"),
    });
    expect(mocks.read).not.toHaveBeenCalled();
  } finally {
    unregister();
  }
});

it.each(["\n", "\r\n"])(
  "uses voice read hashes to save native files with %j endings and rejects subsequent user changes",
  async (newline) => {
    const root = mkdtempSync(join(tmpdir(), "codaloud-voice-save-"));
    const projectId = "00000000-0000-4000-8000-000000000099";
    const call = (operation: string, args: object = {}) =>
      JSON.parse(
        execFileSync(
          resolve("modules/local-workspace/build-host/workspace-cli"),
          [root],
          {
            input: JSON.stringify({ projectId, operation, args }),
            encoding: "utf8",
          },
        ),
      );
    try {
      expect(call("initialize").ok).toBe(true);
      const path = join(root, projectId, "demo.ts");
      const original = `export const greeting = 'Olá 👋';${newline}`;
      writeFileSync(path, original);
      mocks.read.mockImplementation(
        async () => call("read-file", { path: "demo.ts" }).data,
      );
      mocks.analyze.mockResolvedValue({ diagnostics: [] });
      const request = await inlineSession.begin(projectId, "agent");
      const read = (await readVoiceWorkspace(projectId, {
        id: request.id,
        name: "readFile",
        args: { path: "demo.ts", length: 1200 },
      })) as { content: string; contentHash?: string };
      expect(read.content).toBe(original);
      const changed = original + `export const count: number = 42;${newline}`;
      const result = call("save-file", {
        path: "demo.ts",
        content: changed,
        expectedContentHash: read.contentHash ?? "0".repeat(64),
      });
      expect(result).toMatchObject({ ok: true });
      expect(readFileSync(path, "utf8")).toBe(changed);
      writeFileSync(path, changed + `// user edit${newline}`);
      expect(
        call("save-file", {
          path: "demo.ts",
          content: "stale overwrite",
          expectedContentHash: result.data.contentHash,
        }),
      ).toMatchObject({ ok: false, code: "FILE_CHANGED" });
      expect(readFileSync(path, "utf8")).toContain("// user edit");
    } finally {
      mocks.read.mockReset();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
it("reads frozen unsaved contents and never exposes mutation tools", async () => {
  const { request, unregister } = await begin();
  mocks.analyze.mockResolvedValue({
    diagnostics: [
      {
        from: 8,
        to: 14,
        source: "TypeScript",
        code: "TS2304",
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
      items: [expect.objectContaining({ code: "TS2304" })],
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
it("limits draft voice reads to the open draft buffer", async () => {
  const scope = "draft:123";
  const unregister = inlineSession.register(scope, {
    capture: async () => ({
      projectId: scope,
      branch: "",
      openFiles: [],
      activeFile: {
        path: "idea.py",
        documentKey: "draft-document",
        revision: 1,
        content: "print('draft')",
        from: 0,
        to: 0,
        focused: false,
      },
    }),
    preview: () => {},
    apply: async () => true,
  });
  const request = await inlineSession.begin(scope, "quick-edit");
  expect(
    await readVoiceWorkspace(scope, {
      id: request.id,
      name: "readFile",
      args: { path: "idea.py", length: 100 },
    }),
  ).toMatchObject({ content: "print('draft')", source: "editor" });
  await expect(
    readVoiceWorkspace(scope, {
      id: request.id,
      name: "readFile",
      args: { path: "other.py" },
    }),
  ).rejects.toThrow(/draft/i);
  await expect(
    readVoiceWorkspace(scope, {
      id: request.id,
      name: "listFiles",
      args: { path: "" },
    }),
  ).rejects.toThrow(/draft/i);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
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
  if ("content" in result && typeof result.content === "string") {
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
it("uses editor LF offsets when capturing a CRLF file for an exact replacement", () => {
  const request = {
    id: "one",
    projectId: "p",
    mode: "quick-edit" as const,
    status: "listening" as const,
    text: "",
    transcript: "",
    context: {
      projectId: "p",
      branch: "main",
      openFiles: [],
      activeFile: {
        path: "a.ts",
        documentKey: "doc",
        revision: 1,
        content: "first\r\nMath.random\r\nlast",
        from: 6,
        to: 17,
        focused: true,
      },
    },
  };
  expect(getVoiceContext(request).activeFile).toMatchObject({
    before: "first\n",
    selected: "Math.random",
    after: "\nlast",
  });
});
it("does not send a protected open file or return protected search matches", async () => {
  const { request, unregister } = await begin();
  mocks.aiDisabledPaths = "a.ts\n.env*";
  expect(() => getVoiceContext(request)).toThrow(/disabled/i);
  await expect(
    readVoiceWorkspace("p", {
      id: request.id,
      name: "readFile",
      args: { path: "a.ts" },
    }),
  ).rejects.toThrow(/disabled/i);
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.list.mockResolvedValue({
    files: [{ path: "a.ts" }, { path: "safe.ts" }],
    nextCursor: null,
  });
  const result = await readVoiceWorkspace("p", {
    id: request.id,
    name: "searchFiles",
    args: { search: "safe", scope: "title", path: "", pageSize: 10 },
  });
  expect(result).toMatchObject({ files: [{ path: "safe.ts" }] });
  unregister();
});
it("captures the device-selected inline model with the voice request", async () => {
  const { request, unregister } = await begin();
  mocks.inlineModel = "anthropic/claude-haiku-4.5";
  expect(getVoiceContext(request).inlineModel).toBe(
    "anthropic/claude-haiku-4.5",
  );
  unregister();
});

it("returns a bounded, marked receipt for oversized completed action output", () => {
  const result = {
    ok: true,
    text: '😀"'.repeat(10000),
    revision: "a".repeat(64),
    changedFiles: Array.from({ length: 50 }, (_, i) => `src/${i}.ts`),
    truncated: false,
  };
  const encoded = encodeVoicePayload(result);
  expect(new TextEncoder().encode(encoded).length).toBeLessThanOrEqual(12000);
  expect(JSON.parse(encoded)).toMatchObject({
    ok: true,
    revision: result.revision,
    truncated: true,
  });
  expect(result.text.length).toBe(30000);
});
