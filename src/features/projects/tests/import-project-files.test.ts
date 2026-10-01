import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal in-memory filesystem so the real copy step runs without a device. */
const fs = vi.hoisted(() => {
  const state = { entries: new Set<string>(), sizes: new Map<string, number>(), failures: new Set<string>(), afterCopy: null as (() => void) | null };
  class Directory {
    uri: string;
    constructor(...uris: (string | { uri: string })[]) {
      const [head, ...rest] = uris;
      this.uri = [typeof head === "string" ? head.replace(/\/$/, "") : head.uri, ...rest.map(String)].join("/");
    }
    get name() { return this.uri.split("/").filter(Boolean).at(-1) ?? ""; }
    get exists() { return state.entries.has(`${this.uri}/`); }
    create() { state.entries.add(`${this.uri}/`); }
    list() { return []; }
  }
  class File {
    uri: string;
    constructor(...uris: (string | { uri: string })[]) {
      const [head, ...rest] = uris;
      this.uri = [typeof head === "string" ? head.replace(/\/$/, "") : head.uri, ...rest.map(String)].join("/");
    }
    get name() { return this.uri.split("/").filter(Boolean).at(-1) ?? ""; }
    get size() { return state.sizes.get(this.uri) ?? 0; }
    get exists() { return state.entries.has(this.uri); }
    get parentDirectory() { return new Directory(this.uri.split("/").slice(0, -1).join("/")); }
    async copy(destination: { uri: string }, options?: { overwrite?: boolean }) {
      if (!this.exists) throw new Error("The picked file is no longer available on this device.");
      if (state.failures.has(this.uri)) throw new Error("Out of storage.");
      if (!options?.overwrite && state.entries.has(destination.uri))
        throw new Error("The destination already exists.");
      state.entries.add(destination.uri);
      state.sizes.set(destination.uri, this.size);
      state.afterCopy?.();
    }
  }
  return {
    state,
    File,
    Directory,
    Paths: { get document() { return new Directory("file:///var/mobile/Documents/"); } },
  };
});

vi.mock("expo-file-system", () => fs as never);
vi.mock("@/services/local-workspace/execute", () => ({
  LocalWorkspaceError: class WorkspaceFailure extends Error {
    readonly code = "PROJECT_NOT_FOUND";
  },
  executeWorkspace: vi.fn(async () => []),
}));
vi.mock("../local/access", () => ({
  requireLocalProject: vi.fn(async (id: string) => {
    if (id !== projectId) throw new Error("This project is not on this device.");
    return { id };
  }),
}));
vi.mock("../local/file-paths", () => ({ readLocalFilePaths: vi.fn() }));

import { importProjectFilesAction } from "../actions/import-actions";
import { readLocalFilePaths } from "../local/file-paths";
import { subscribeWorkspaceChanges } from "@/services/local-workspace/change-events";

const projectId = "00000000-0000-4000-8000-0000000000aa";
const workspace = "file:///var/mobile/Documents/codaloud-workspaces/" + projectId;
const picked = "file:///var/mobile/Library/Caches/DocumentPicker";
const listing = vi.mocked(readLocalFilePaths);

const file = (relative: string, size = 3) => {
  const uri = `${picked}/${relative}`;
  fs.state.entries.add(uri);
  fs.state.sizes.set(uri, size);
  return { relativePath: relative, name: relative.split("/").at(-1)!, uri, size };
};

/** Paths the project itself can see, mirroring what the native listing returns. */
const projectPaths = () =>
  [...fs.state.entries]
    .filter((path) => path.startsWith(`${workspace}/`) && !path.endsWith("/"))
    .map((path) => path.slice(workspace.length + 1));

const run = (items: ReturnType<typeof file>[], overrides: Record<string, unknown> = {}) =>
  importProjectFilesAction(projectId, { directoryPath: "", items, ...overrides });

beforeEach(() => {
  fs.state.entries = new Set([`${workspace}/`]);
  fs.state.sizes = new Map();
  fs.state.failures = new Set();
  fs.state.afterCopy = null;
  listing.mockReset();
  // One listing before the copy (collisions) and one after (verification).
  listing.mockImplementation(async () => projectPaths());
});

describe("importProjectFilesAction", () => {
  it("copies picked files into the project root and reports them", async () => {
    const changed = vi.fn();
    const release = subscribeWorkspaceChanges(projectId, changed);
    const result = await run([file("a.ts"), file("b.md", 8)]);
    expect(result).toMatchObject({ error: false, message: "Uploaded 2 files to this project." });
    if (!result.error)
      expect(result.data).toEqual({
        imported: ["a.ts", "b.md"],
        replaced: [],
        skipped: [],
      });
    expect(fs.state.entries.has(`${workspace}/a.ts`)).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    release();
  });

  it("creates the folder chain for a picked directory tree", async () => {
    const result = await run([file("src/nested/app.ts")], { directoryPath: "upload" });
    expect(result).toMatchObject({ error: false, data: { imported: ["upload/src/nested/app.ts"] } });
    expect(fs.state.entries.has(`${workspace}/upload/src/nested/app.ts`)).toBe(true);
  });

  it("refuses the whole upload when a destination already exists", async () => {
    fs.state.entries.add(`${workspace}/a.ts`);
    fs.state.sizes.set(`${workspace}/a.ts`, 1);
    const result = await run([file("a.ts"), file("b.ts")]);
    expect(result).toMatchObject({ error: true, code: "IMPORT_CONFLICT", conflicts: ["a.ts"] });
    // The existing file keeps its bytes and the non-clashing file never lands.
    expect(fs.state.sizes.get(`${workspace}/a.ts`)).toBe(1);
    expect(fs.state.entries.has(`${workspace}/b.ts`)).toBe(false);
  });

  it("overwrites only the clashing files when the user chose replace", async () => {
    fs.state.entries.add(`${workspace}/a.ts`);
    fs.state.sizes.set(`${workspace}/a.ts`, 1);
    const result = await run([file("a.ts", 9), file("b.ts")], { mode: "replace" });
    expect(result).toMatchObject({ error: false, data: { replaced: ["a.ts"] } });
    expect(fs.state.sizes.get(`${workspace}/a.ts`)).toBe(9);
  });

  it("keeps existing files when the user chose skip", async () => {
    fs.state.entries.add(`${workspace}/a.ts`);
    fs.state.sizes.set(`${workspace}/a.ts`, 1);
    const result = await run([file("a.ts", 9), file("b.ts")], { mode: "skip" });
    expect(result).toMatchObject({ error: false, data: { imported: ["b.ts"], skipped: ["a.ts"] } });
    expect(fs.state.sizes.get(`${workspace}/a.ts`)).toBe(1);
  });

  it("succeeds with nothing imported when every file was skipped", async () => {
    fs.state.entries.add(`${workspace}/a.ts`);
    const result = await run([file("a.ts")], { mode: "skip" });
    expect(result).toMatchObject({ error: false, data: { imported: [], skipped: ["a.ts"] } });
  });

  it("fails when the project cannot read a file back", async () => {
    listing.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await run([file("a.ts")]);
    expect(result).toMatchObject({
      error: true,
      code: "IMPORT_NOT_VISIBLE",
      message: expect.stringMatching(/could not read/i),
    });
  });

  it("reports the first copy reason when nothing landed", async () => {
    const item = file("a.ts");
    fs.state.failures.add(item.uri);
    const result = await run([item]);
    expect(result).toMatchObject({ error: true, code: "IMPORT_FAILED", message: "Out of storage." });
  });

  it("reports a partial upload as a failure with the files that landed", async () => {
    const first = file("a.ts");
    const second = file("b.ts");
    fs.state.failures.add(second.uri);
    const result = await run([first, second]);
    expect(result).toMatchObject({
      error: true,
      code: "IMPORT_PARTIAL",
      imported: ["a.ts"],
      message: expect.stringMatching(/b\.ts.*Out of storage/i),
    });
    expect(projectPaths()).toEqual(["a.ts"]);
  });

  it("reports cancellation after a copy as a partial upload", async () => {
    const controller = new AbortController();
    fs.state.afterCopy = () => controller.abort();
    const result = await importProjectFilesAction(
      projectId,
      { directoryPath: "", items: [file("a.ts"), file("b.ts")] },
      controller.signal,
    );
    expect(result).toMatchObject({
      error: true,
      code: "CANCELLED",
      imported: ["a.ts"],
      message: expect.stringMatching(/cancelled.*1 of 2/i),
    });
    expect(projectPaths()).toEqual(["a.ts"]);
  });

  it("refuses a source that vanished after picking", async () => {
    const result = await run([
      { relativePath: "gone.ts", name: "gone.ts", uri: `${picked}/gone.ts`, size: 1 },
    ]);
    expect(result).toMatchObject({ error: true, code: "IMPORT_FAILED" });
  });

  it("cancels before touching the disk when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await importProjectFilesAction(
      projectId,
      { directoryPath: "", items: [file("a.ts")] },
      controller.signal,
    );
    expect(result).toMatchObject({ error: true, code: "CANCELLED" });
    expect(projectPaths()).toEqual([]);
  });

  it("keeps the files that already landed when an abort interrupts the copy", async () => {
    const controller = new AbortController();
    listing.mockImplementation(async () => {
      controller.abort();
      return [];
    });
    const result = await importProjectFilesAction(
      projectId,
      { directoryPath: "", items: [file("a.ts"), file("b.ts")] },
      controller.signal,
    );
    expect(result).toMatchObject({ error: true, code: "CANCELLED" });
  });

  it.each([
    ["a missing project", () => importProjectFilesAction("00000000-0000-4000-8000-0000000000bb", { directoryPath: "", items: [file("a.ts")] })],
    ["an empty selection", () => run([])],
    ["a traversal name", () => run([{ relativePath: "../escape.ts", name: "escape.ts", uri: `${picked}/escape.ts`, size: 1 }])],
    ["a non-file uri", () => run([{ relativePath: "a.ts", name: "a.ts", uri: "javascript:alert(1)", size: 1 }])],
    ["an absolute path", () => run([{ relativePath: "/etc/passwd", name: "passwd", uri: `${picked}/passwd`, size: 1 }])],
    ["an oversized file", () => run([file("big.bin", 32 * 1024 * 1024 + 1)])],
    ["an unknown mode", () => run([file("a.ts")], { mode: "overwrite" })],
    ["extra keys", () => run([file("a.ts")], { unexpected: true })],
  ])("refuses %s without writing into the project", async (_label, attempt) => {
    const result = await attempt();
    expect(result.error).toBe(true);
    expect(projectPaths()).toEqual([]);
  });

  it("reports a project whose folder is missing", async () => {
    fs.state.entries.delete(`${workspace}/`);
    const result = await run([file("a.ts")]);
    expect(result).toMatchObject({ error: true });
    expect((result as { message: string }).message).toMatch(/not available/i);
  });
});
