import { beforeEach, describe, expect, it, vi } from "vitest";

import { copyDraftToProjectAction } from "../actions/copy-draft-actions";
import { LocalWorkspaceError } from "@/services/local-workspace/execute";
import { sha256Hex } from "@/lib/hashes";
import type { ProjectFileEntrySchema } from "@/features/projects/actions/file-schemas";
import type { DraftResponseData } from "../types";

const doubles = vi.hoisted(() => ({ execute: vi.fn(), read: vi.fn(), asset: false, importFiles: vi.fn() }));

vi.mock("../lib/draft-assets", () => ({
  draftHasAsset: () => doubles.asset,
  draftAssetFile: () => ({ uri: "file:///draft-assets/content", size: 24 }),
}));
vi.mock("@/features/projects/actions/import-actions", () => ({
  importProjectFilesAction: doubles.importFiles,
}));

vi.mock("@/services/local-workspace/execute", () => {
  class WorkspaceFailure extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    executeWorkspace: (...args: unknown[]) => doubles.execute(...args),
    LocalWorkspaceError: WorkspaceFailure,
  };
});

vi.mock("../local/access", () => ({
  getLocalDrafts: async () => ({ read: doubles.read }),
}));

vi.mock("@/features/projects/local/access", () => ({
  requireLocalProject: async (id: string) => ({ id }),
}));

const draftId = "00000000-0000-4000-8000-0000000000d1";
const projectId = "00000000-0000-4000-8000-0000000000aa";
const content = "export const a = 1;\n";

const draft = (overrides: Partial<DraftResponseData> = {}): DraftResponseData => ({
  id: draftId,
  filename: "helper.ts",
  content,
  createdAt: "2026-09-18T12:00:00.000Z",
  updatedAt: "2026-09-18T12:00:00.000Z",
  ...overrides,
});

const input = (overrides: Record<string, unknown> = {}) => ({
  draftId,
  projectId,
  directoryPath: "",
  filename: "helper.ts",
  ...overrides,
});

/** Mirrors the native rules: exclusive create, hash-guarded save, per-folder listing. */
const createHarness = (files: Record<string, string> = {}) => {
  const stored = new Map(Object.entries(files));
  const entry = (name: string, path: string): ProjectFileEntrySchema => ({
    name,
    path,
    isDir: false,
    size: (stored.get(path) ?? "").length,
  });
  const resolve = (parentPath: string, name: string) =>
    parentPath ? `${parentPath}/${name}` : name;

  const handler = (
    _id: string,
    operation: string,
    args: Record<string, unknown> = {},
  ) => {
    if (operation === "list-files") {
      const prefix = (args.path as string) === "" ? "" : `${args.path as string}/`;
      return Promise.resolve(
        [...stored.keys()]
          .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
          .map((key) => entry(key.slice(prefix.length), key)),
      );
    }
    if (operation === "create-file") {
      const path = resolve(args.parentPath as string, args.name as string);
      if (stored.has(path))
        return Promise.reject(
          new LocalWorkspaceError("FILE_EXISTS", "A file or folder already uses this name."),
        );
      stored.set(path, "");
      return Promise.resolve(entry(args.name as string, path));
    }
    if (operation === "read-file") {
      const current = stored.get(args.path as string);
      if (current === undefined)
        return Promise.reject(new LocalWorkspaceError("FILE_UNAVAILABLE", "Unable to read this file."));
      return Promise.resolve({ path: args.path, content: current, size: current.length });
    }
    if (operation === "save-file") {
      const current = stored.get(args.path as string);
      if (current === undefined)
        return Promise.reject(new LocalWorkspaceError("FILE_UNAVAILABLE", "Unable to read this file."));
      if (sha256Hex(current) !== args.expectedContentHash)
        return Promise.reject(
          new LocalWorkspaceError("FILE_CHANGED", "This file changed since it was opened. Reload it before saving."),
        );
      stored.set(args.path as string, args.content as string);
      return Promise.resolve({
        path: args.path,
        size: (args.content as string).length,
        contentHash: sha256Hex(args.content as string),
      });
    }
    if (operation === "delete-file") {
      stored.delete(resolve(args.parentPath as string, args.name as string));
      return Promise.resolve(entry(args.name as string, resolve(args.parentPath as string, args.name as string)));
    }
    return Promise.reject(new LocalWorkspaceError("UNKNOWN_OPERATION", "Unknown local workspace operation."));
  };

  return { stored, handler };
};

const setup = (files: Record<string, string> = {}, current: DraftResponseData | null = draft()) => {
  const harness = createHarness(files);
  doubles.execute.mockImplementation(harness.handler);
  doubles.read.mockReturnValue(current);
  return harness;
};

beforeEach(() => {
  doubles.execute.mockReset();
  doubles.read.mockReset();
  doubles.asset = false;
  doubles.importFiles.mockReset();
});

describe("copyDraftToProjectAction", () => {
  it("copies an image draft as binary without reading it as text", async () => {
    setup({}, draft({ filename: "diagram.png", content: "" }));
    doubles.asset = true;
    doubles.importFiles.mockResolvedValue({
      error: false,
      data: { imported: ["images/diagram.png"], replaced: [], skipped: [] },
    });
    await expect(copyDraftToProjectAction(input({ directoryPath: "images", filename: "diagram.png" })))
      .resolves.toMatchObject({ error: false, data: { path: "images/diagram.png", size: 24 } });
    expect(doubles.importFiles).toHaveBeenCalledWith(projectId, {
      directoryPath: "images",
      items: [{ relativePath: "diagram.png", name: "diagram.png", uri: "file:///draft-assets/content", size: 24 }],
      mode: "fail",
    });
    expect(doubles.execute).not.toHaveBeenCalledWith(projectId, "read-file", expect.anything());
  });

  it("reports an image copy collision for the rename/replace decision", async () => {
    setup({}, draft({ filename: "diagram.png", content: "" }));
    doubles.asset = true;
    doubles.importFiles.mockResolvedValue({ error: true, code: "IMPORT_CONFLICT", message: "Exists" });
    await expect(copyDraftToProjectAction(input({ filename: "diagram.png" })))
      .resolves.toMatchObject({ error: true, code: "FILE_EXISTS" });
  });

  it("creates the file, writes the draft, and reports the destination", async () => {
    const { stored } = setup();
    await expect(copyDraftToProjectAction(input())).resolves.toMatchObject({
      error: false,
      data: {
        projectId,
        directoryPath: "",
        filename: "helper.ts",
        path: "helper.ts",
        size: content.length,
        replaced: false,
      },
    });
    expect(stored.get("helper.ts")).toBe(content);
  });

  it("copies into a nested folder and reads the draft by its own id", async () => {
    const { stored } = setup({ "src/index.ts": "const x = 1;" });
    await expect(
      copyDraftToProjectAction(input({ directoryPath: "src" })),
    ).resolves.toMatchObject({ error: false, data: { path: "src/helper.ts" } });
    expect(stored.get("src/helper.ts")).toBe(content);
    expect(doubles.read).toHaveBeenCalledWith(draftId);
  });

  it("trims the chosen filename before writing it", async () => {
    const { stored } = setup();
    await expect(
      copyDraftToProjectAction(input({ filename: "  helper.ts  " })),
    ).resolves.toMatchObject({ error: false, data: { filename: "helper.ts" } });
    expect(stored.has("helper.ts")).toBe(true);
  });

  it("refuses an existing name instead of overwriting it", async () => {
    const { stored } = setup({ "helper.ts": "keep me" });
    await expect(copyDraftToProjectAction(input())).resolves.toMatchObject({
      error: true,
      code: "FILE_EXISTS",
    });
    expect(stored.get("helper.ts")).toBe("keep me");
  });

  it("replaces only after confirming the current contents", async () => {
    const { stored } = setup({ "helper.ts": "older" });
    await expect(
      copyDraftToProjectAction(input({ mode: "replace" })),
    ).resolves.toMatchObject({ error: false, data: { replaced: true } });
    expect(stored.get("helper.ts")).toBe(content);
  });

  it("keeps a replaced file's hash precondition honest", async () => {
    const harness = setup({ "helper.ts": "older" });
    doubles.execute.mockImplementation(async (id, operation, args = {}) => {
      if (operation === "save-file")
        return Promise.reject(
          new LocalWorkspaceError("FILE_CHANGED", "This file changed since it was opened."),
        );
      return harness.handler(id, operation, args);
    });
    await expect(
      copyDraftToProjectAction(input({ mode: "replace" })),
    ).resolves.toMatchObject({ error: true, code: "FILE_CHANGED" });
    expect(harness.stored.get("helper.ts")).toBe("older");
  });

  it("refuses a name already used by a folder", async () => {
    doubles.execute.mockImplementation(async (_id: string, operation: string) =>
      operation === "list-files"
        ? [{ name: "helper.ts", path: "helper.ts", isDir: true, size: 0 }]
        : [],
    );
    doubles.read.mockReturnValue(draft());
    await expect(copyDraftToProjectAction(input())).resolves.toMatchObject({
      error: true,
      code: "FILE_EXISTS",
    });
    expect(doubles.execute).not.toHaveBeenCalledWith(
      expect.any(String),
      "create-file",
      expect.anything(),
    );
  });

  it("rolls the new file back when the write fails", async () => {
    const harness = setup();
    doubles.execute.mockImplementation(async (id, operation, args) => {
      if (operation === "save-file")
        throw new LocalWorkspaceError("FILE_WRITE_FAILED", "Out of storage.");
      return harness.handler(id, operation, args);
    });
    await expect(copyDraftToProjectAction(input())).resolves.toMatchObject({
      error: true,
      code: "FILE_WRITE_FAILED",
    });
    expect(harness.stored.has("helper.ts")).toBe(false);
    expect(doubles.execute).toHaveBeenCalledWith(
      projectId,
      "delete-file",
      { parentPath: "", name: "helper.ts", kind: "file" },
    );
  });

  it("reports a draft that is no longer on the device", async () => {
    const harness = setup();
    doubles.read.mockReturnValue(null);
    await expect(copyDraftToProjectAction(input())).resolves.toMatchObject({
      error: true,
      code: "DRAFT_NOT_FOUND",
    });
    expect(harness.stored.size).toBe(0);
  });

  it("keeps the project unchanged when a request cannot be validated", async () => {
    for (const overrides of [
      { filename: "" },
      { filename: "../secret" },
      { filename: "nested/name.ts" },
      { draftId: "not-a-uuid" },
      { projectId: "nope" },
      { directoryPath: "../outside" },
      { unexpected: true },
      { mode: "overwrite" },
    ]) {
      const harness = setup();
      await expect(
        copyDraftToProjectAction(input(overrides) as never),
      ).resolves.toMatchObject({ error: true });
      expect(harness.stored.size).toBe(0);
    }
  });

  it("copies an empty named draft as an empty file", async () => {
    const { stored } = setup({}, draft({ filename: null, content: " " }));
    await expect(
      copyDraftToProjectAction(input({ filename: "blank.md" })),
    ).resolves.toMatchObject({ error: false, data: { size: 1 } });
    expect(stored.get("blank.md")).toBe(" ");
  });
});
