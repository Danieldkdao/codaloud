import { beforeEach, expect, it, vi } from "vitest";
import { sha256Bytes } from "@/lib/hashes";

const mocks = vi.hoisted(() => ({
  local: new Map<string, Uint8Array>(),
  remote: new Map<string, Uint8Array>(),
  baseline: {} as Record<string, string>,
  writeBaseline: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  downloadBatch: vi.fn(),
  flush: vi.fn(async () => {}),
  setSandboxId: vi.fn(),
  allowLargeSync: false,
  syncAllowedPaths: "node_modules\n__pycache__",
  manifest: vi.fn(),
  readBytes: vi.fn(),
  nativeManifest: vi.fn(),
  modified: new Map<string, number>(),
  savedCache: new Map<string, string>(),
  duringRead: undefined as (() => void) | undefined,
  yield: vi.fn(async () => {}),
}));
vi.mock("@/services/local-workspace/execute", () => {
  class LocalWorkspaceError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { LocalWorkspaceError, executeWorkspace: mocks.nativeManifest };
});
vi.mock("@/lib/yield-to-events", () => ({ yieldToEvents: mocks.yield }));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  editorPreferencesStore: {
    load: async () => {},
    getSnapshot: () => ({
      preferences: {
        allowLargeSync: mocks.allowLargeSync,
        syncAllowedPaths: mocks.syncAllowedPaths,
      },
    }),
  },
}));
vi.mock("expo-file-system", () => ({
  Directory: class {
    create() {}
  },
  File: class {},
  FileMode: { ReadOnly: "r" },
}));
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItem: async (key: string) =>
      key.includes("hash-cache")
        ? (mocks.savedCache.get(key) ?? null)
        : JSON.stringify(mocks.baseline),
    setItem: async (key: string, value: string) => {
      if (key.includes("hash-cache")) mocks.savedCache.set(key, value);
      else mocks.writeBaseline(key, value);
    },
    setItemSync: (key: string, value: string) => {
      mocks.savedCache.set(key, value);
    },
    removeItem: async (key: string) => {
      mocks.savedCache.delete(key);
    },
    removeItemSync: (key: string) => {
      mocks.savedCache.delete(key);
    },
  },
}));
vi.mock("@/features/agent/workspace-access", () => ({
  flushAgentWorkspace: mocks.flush,
}));
vi.mock("@/features/projects/local/access", () => ({
  getLocalProjects: async () => ({
    read: () => ({ id: "project" }),
    getSandboxId: () => "sandbox-1",
    setSandboxId: mocks.setSandboxId,
  }),
}));
vi.mock("@/features/projects/local/file-paths", () => ({
  readLocalFilePaths: async () => [...mocks.local.keys()],
}));
vi.mock("@/features/projects/lib/workspace-paths", () => ({
  projectWorkspaceDirectory: () => "root",
  projectWorkspaceFile: (_projectId: string, path: string) => ({
    info: () => ({
      exists: mocks.local.has(path),
      size: mocks.local.get(path)?.byteLength,
      modificationTime: mocks.modified.get(path),
    }),
    get exists() {
      return mocks.local.has(path);
    },
    get size() {
      return mocks.local.get(path)?.byteLength ?? 0;
    },
    get modificationTime() {
      return mocks.modified.get(path) ?? null;
    },
    bytes: async () => {
      mocks.readBytes(path);
      return mocks.local.get(path)!;
    },
    open: () => {
      mocks.duringRead?.();
      let offset = 0;
      mocks.readBytes(path);
      return {
        readBytes: (length: number) => {
          const value = mocks.local
            .get(path)!
            .subarray(offset, offset + length);
          offset += value.length;
          return value;
        },
        close: () => {},
      };
    },
    create: () => mocks.local.set(path, new Uint8Array()),
    write: (bytes: Uint8Array) => mocks.local.set(path, bytes),
    delete: () => mocks.local.delete(path),
  }),
}));
vi.mock("../actions/terminal-client", () => ({
  getTerminalDeviceId: async () => "device",
  terminalApi: {
    ensure: async () => "sandbox-1",
    manifest: async (...args: unknown[]) => {
      mocks.manifest(...args);
      return Object.fromEntries(
        [...mocks.remote].map(([path, bytes]) => [path, sha256Bytes(bytes)]),
      );
    },
    upload: mocks.upload,
    download: mocks.download,
    downloadBatch: mocks.downloadBatch,
    delete: async (
      _project: string,
      _device: string,
      _sandbox: string,
      path: string,
    ) => {
      mocks.remote.delete(path);
    },
  },
}));

import { syncProjectWorkspace } from "../actions/sync-workspace";
const bytes = (text: string) => new TextEncoder().encode(text);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nativeManifest.mockImplementation(async () => {
    const { LocalWorkspaceError } =
      await import("@/services/local-workspace/execute");
    throw new LocalWorkspaceError("UNKNOWN_OPERATION", "Update native app");
  });
  mocks.yield.mockImplementation(
    () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  );
  mocks.local.clear();
  mocks.remote.clear();
  mocks.modified.clear();
  mocks.savedCache.clear();
  mocks.duringRead = undefined;
  mocks.baseline = {};
  mocks.allowLargeSync = false;
  mocks.syncAllowedPaths = "node_modules\n__pycache__";
  mocks.upload.mockImplementation(
    async (_project, _device, _sandbox, path, value) => {
      mocks.remote.set(path, value);
    },
  );
  mocks.downloadBatch.mockImplementation(
    async (_project, _device, _sandbox, paths: string[]) =>
      paths.map((path) => ({ path, bytes: mocks.remote.get(path)! })),
  );
  mocks.download.mockImplementation(async (_project, _device, _sandbox, path) =>
    mocks.remote.get(path),
  );
});
it("rejects a device edit during hashing before publishing cache hints or transfers", async () => {
  const project = "project-hash-race";
  mocks.local.set("a.txt", bytes("one"));
  const { notifyWorkspaceChanged } =
    await import("@/services/local-workspace/change-events");
  mocks.duringRead = () => {
    mocks.duringRead = undefined;
    notifyWorkspaceChanged(project, ["a.txt"]);
  };
  await expect(syncProjectWorkspace(project)).rejects.toThrow(
    /changed while checking/,
  );
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.savedCache.has(`codaloud.terminal.hash-cache.${project}`)).toBe(
    false,
  );
});

it("scans many tiny files without spending a UI frame waiting after each file", async () => {
  mocks.yield.mockResolvedValue(undefined);
  for (let index = 0; index < 1000; index++) {
    const path = `tiny/${index}.txt`;
    mocks.local.set(path, bytes("hello"));
    mocks.remote.set(path, bytes("hello"));
    mocks.modified.set(path, 1000);
  }
  const result = await syncProjectWorkspace("tiny-file-budget");
  expect(result.uploaded + result.downloaded).toBe(0);
  expect(mocks.readBytes).toHaveBeenCalledTimes(1000);
  expect(mocks.yield.mock.calls.length).toBeLessThan(100);
});

it("downloads a selected dependency folder only after the device setting is enabled", async () => {
  const path = "node_modules/pkg/index.d.ts";
  mocks.remote.set(path, bytes("export type Value = string;"));
  const off = await syncProjectWorkspace("project-sync-off");
  expect(off.downloadedPaths).toEqual([]);
  expect(mocks.local.has(path)).toBe(false);

  mocks.allowLargeSync = true;
  const on = await syncProjectWorkspace("project-sync-on");
  expect(on.downloadedPaths).toEqual([path]);
  expect(new TextDecoder().decode(mocks.local.get(path))).toBe(
    "export type Value = string;",
  );
  expect(mocks.manifest).toHaveBeenLastCalledWith(
    "project-sync-on",
    "device",
    "sandbox-1",
    ["node_modules", "__pycache__"],
    { [path]: sha256Bytes(mocks.remote.get(path)!) },
  );
});

it("preserves the complete bytes of a terminal-created text file", async () => {
  const text = "`created from terminal`\nsecond line with spaces 🌿\n";
  mocks.remote.set("note.txt", bytes(text));
  const result = await syncProjectWorkspace("project-text-roundtrip");
  expect(result.downloadedPaths).toEqual(["note.txt"]);
  expect(new TextDecoder().decode(mocks.local.get("note.txt"))).toBe(text);
});

it("skips oversized files by default and uploads a selected large file", async () => {
  const path = "assets/large.bin";
  mocks.local.set(path, new Uint8Array(33 * 1024 * 1024));
  const off = await syncProjectWorkspace("project-large-off");
  expect(off.uploaded).toBe(0);
  mocks.allowLargeSync = true;
  mocks.syncAllowedPaths = path;
  const on = await syncProjectWorkspace("project-large-on");
  expect(on.uploadedPaths).toEqual([path]);
});

it("brings a changed sandbox file over an unchanged local copy and advances the base", async () => {
  mocks.local.set("package.json", bytes("before"));
  mocks.remote.set("package.json", bytes("after"));
  mocks.baseline = { "package.json": sha256Bytes(bytes("before")) };
  const result = await syncProjectWorkspace("project-remote-change");
  expect(new TextDecoder().decode(mocks.local.get("package.json"))).toBe(
    "after",
  );
  expect(result.downloadedPaths).toEqual(["package.json"]);
  expect(result.conflicts).toEqual([]);
  expect(JSON.parse(mocks.writeBaseline.mock.calls[0][1])["package.json"]).toBe(
    sha256Bytes(bytes("after")),
  );
});

it("keeps both copies when local and sandbox edited the same file", async () => {
  mocks.local.set("main.py", bytes("local"));
  mocks.remote.set("main.py", bytes("remote"));
  mocks.baseline = { "main.py": sha256Bytes(bytes("before")) };
  const result = await syncProjectWorkspace("project-conflict");
  expect(result.conflicts).toEqual(["main.py"]);
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(new TextDecoder().decode(mocks.local.get("main.py"))).toBe("local");
  expect(new TextDecoder().decode(mocks.remote.get("main.py"))).toBe("remote");
});

it("reuses unchanged metadata hashes and rereads a same-size edited file", async () => {
  mocks.local.set("main.py", bytes("print(1)"));
  mocks.remote.set("main.py", bytes("print(1)"));
  mocks.modified.set("main.py", 1);
  await syncProjectWorkspace("project-metadata-cache");
  mocks.baseline = { "main.py": sha256Bytes(bytes("print(1)")) };
  mocks.readBytes.mockClear();
  await syncProjectWorkspace("project-metadata-cache");
  expect(mocks.readBytes).not.toHaveBeenCalled();

  mocks.local.set("main.py", bytes("print(2)"));
  mocks.modified.set("main.py", 2);
  const result = await syncProjectWorkspace("project-metadata-cache");
  expect(mocks.readBytes).toHaveBeenCalledWith("main.py");
  expect(result.uploadedPaths).toEqual(["main.py"]);
  expect(new TextDecoder().decode(mocks.remote.get("main.py"))).toBe(
    "print(2)",
  );
});

it("reports the upload failure that leaves the sandbox without a local file", async () => {
  mocks.local.set("index.ts", bytes("console.log(1)"));
  mocks.upload.mockRejectedValueOnce(new Error("Daytona upload unavailable"));
  const result = await syncProjectWorkspace("project-upload-error");
  expect(result.failures).toEqual(["index.ts"]);
  expect(result.failureReasons).toEqual({
    "index.ts": "Daytona upload unavailable",
  });
  expect(mocks.remote.has("index.ts")).toBe(false);
});

it("reports confirmed uploaded paths for the terminal status", async () => {
  mocks.local.set("src/new.ts", bytes("created from terminal"));
  const result = await syncProjectWorkspace("project-upload-report");
  expect(result.uploadedPaths).toEqual(["src/new.ts"]);
});

it("does not treat an unconfirmed upload as runnable", async () => {
  mocks.local.set("main.py", bytes("print(1)"));
  mocks.upload.mockResolvedValueOnce(undefined);
  const result = await syncProjectWorkspace("project-unconfirmed-upload");
  expect(result.failures).toEqual(["main.py"]);
  expect(result.failureReasons["main.py"]).toMatch(/not confirmed/i);
});

it("keeps navigation responsive and reports progress during a dependency download", async () => {
  mocks.allowLargeSync = true;
  for (let index = 0; index < 512; index++)
    mocks.remote.set(
      `node_modules/pkg/file-${index}.js`,
      bytes(`export default ${index};`),
    );
  let navigationRan = false;
  setTimeout(() => {
    navigationRan = true;
  }, 0);
  const progress = vi.fn();
  const result = await syncProjectWorkspace(
    "project-many-dependencies",
    progress,
  );
  expect(navigationRan).toBe(true);
  expect(result.downloaded).toBe(512);
  expect(progress).toHaveBeenCalledWith("Downloading 512 / 512 files…");
  expect(result.failures).toEqual([]);
  expect(mocks.local.size).toBe(512);
});

it("transfers 128 small dependencies in one request instead of 128", async () => {
  mocks.allowLargeSync = true;
  for (let index = 0; index < 128; index++)
    mocks.remote.set(
      `node_modules/pkg/file-${index}.js`,
      bytes(`module.exports = ${index};`),
    );
  const result = await syncProjectWorkspace("project-batched-download");
  expect(result.downloaded).toBe(128);
  expect(mocks.downloadBatch).toHaveBeenCalledOnce();
  expect(mocks.download).not.toHaveBeenCalled();
  for (const [path, value] of mocks.remote)
    expect(mocks.local.get(path)).toEqual(value);
});

it("keeps batch overflow files grouped instead of draining a slow single-file tail", async () => {
  const content = new Uint8Array(256 * 1024);
  for (let index = 0; index < 64; index++)
    mocks.remote.set(`dependency-${index}.bin`, content);
  mocks.downloadBatch.mockImplementation(
    async (_project, _device, _sandbox, paths: string[]) => {
      let remaining = 8 * 1024 * 1024;
      return paths.map((path) => {
        const value = mocks.remote.get(path)!;
        if (value.byteLength > remaining)
          return { path, individual: true, fileSize: value.byteLength };
        remaining -= value.byteLength;
        return { path, bytes: value };
      });
    },
  );
  const result = await syncProjectWorkspace("batch-overflow-tail");
  expect(result.downloaded).toBe(64);
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.downloadBatch).toHaveBeenCalledTimes(2);
});

it("downloads a thousand tiny files in four bounded requests without repainting for every file", async () => {
  for (let index = 0; index < 1000; index++)
    mocks.remote.set(`small-${index}.txt`, bytes("hello"));
  const progress = vi.fn();
  const result = await syncProjectWorkspace(
    "thousand-small-downloads",
    progress,
  );
  expect(result.downloaded).toBe(1000);
  expect(mocks.downloadBatch.mock.calls.length).toBeLessThanOrEqual(4);
  expect(
    progress.mock.calls.filter(([message]) => message.startsWith("Downloading"))
      .length,
  ).toBeLessThan(40);
  expect(progress).toHaveBeenCalledWith("Downloading 1,000 / 1,000 files…");
  const metrics = JSON.parse(
    mocks.savedCache.get(
      "codaloud.terminal.last-sync.thousand-small-downloads",
    )!,
  );
  expect(metrics).toMatchObject({
    downloadBatchRequests: 4,
    individualDownloadRequests: 0,
    downloadedBytes: 5000,
  });
});

it("splits long Unicode paths before the response header exceeds its byte limit", async () => {
  for (let index = 0; index < 256; index++)
    mocks.remote.set(`${"測".repeat(600)}/${index}.txt`, bytes("hello"));
  const result = await syncProjectWorkspace("bounded-unicode-download-headers");
  expect(result.downloaded).toBe(256);
  const { encodeSyncDownload } = await import("../lib/sync-download");
  for (const [_project, _device, _sandbox, paths] of mocks.downloadBatch.mock
    .calls)
    expect(() =>
      encodeSyncDownload(
        paths.map((path: string) => ({ path, bytes: mocks.remote.get(path)! })),
      ),
    ).not.toThrow();
});

it("preserves existing bytes when a file changes on either side during a batch", async () => {
  const original = bytes("before"),
    remote = bytes("remote"),
    edited = bytes("edited");
  mocks.local.set("a.txt", original);
  mocks.remote.set("a.txt", remote);
  mocks.baseline = { "a.txt": sha256Bytes(original) };
  mocks.downloadBatch.mockImplementationOnce(async () => {
    mocks.local.set("a.txt", edited);
    return [{ path: "a.txt", bytes: remote }];
  });
  const result = await syncProjectWorkspace("project-concurrent-device-edit");
  expect(mocks.local.get("a.txt")).toEqual(edited);
  expect(result.failureReasons["a.txt"]).toBe(
    "Local file changed during sync.",
  );
  expect(mocks.writeBaseline).not.toHaveBeenCalled();
  expect(mocks.baseline["a.txt"]).toBe(sha256Bytes(original));
});

it("handles individual large downloads and isolates per-file failures", async () => {
  mocks.remote.set("a.bin", bytes("complete content"));
  mocks.remote.set("b.txt", bytes("missing"));
  mocks.remote.set("c.txt", bytes("correct hash"));
  mocks.downloadBatch.mockResolvedValueOnce([
    { path: "a.bin", individual: true },
    { path: "b.txt", error: "File disappeared" },
    { path: "c.txt", bytes: bytes("changed remotely") },
  ]);
  const result = await syncProjectWorkspace("project-mixed-download");
  expect(mocks.local.get("a.bin")).toEqual(bytes("complete content"));
  expect(result.downloaded).toBe(1);
  expect(result.failures).toEqual(["b.txt", "c.txt"]);
  expect(result.failureReasons["c.txt"]).toBe(
    "Sandbox file changed during sync.",
  );
  expect(mocks.download).toHaveBeenCalledOnce();
});

it("ends a failed transfer and allows a fresh retry", async () => {
  mocks.remote.set("a.txt", bytes("content"));
  mocks.downloadBatch.mockRejectedValueOnce(
    new Error("Terminal request timed out. Try syncing again."),
  );
  await expect(
    syncProjectWorkspace("project-stalled-download"),
  ).rejects.toThrow("timed out");
  const result = await syncProjectWorkspace("project-stalled-download");
  expect(result.downloaded).toBe(1);
  expect(mocks.local.get("a.txt")).toEqual(bytes("content"));
});

it("overlaps bounded download batches and uses one manifest for an unchanged refresh", async () => {
  let active = 0,
    peak = 0;
  for (let index = 0; index < 768; index++)
    mocks.remote.set(`file-${index}.txt`, bytes(String(index)));
  mocks.downloadBatch.mockImplementation(
    async (_project, _device, _sandbox, paths: string[]) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return paths.map((path) => ({ path, bytes: mocks.remote.get(path)! }));
    },
  );
  const first = await syncProjectWorkspace("project-concurrent-batches");
  expect(first.downloaded).toBe(768);
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(3);
  mocks.manifest.mockClear();
  mocks.downloadBatch.mockClear();
  const next = await syncProjectWorkspace("project-concurrent-batches");
  expect(next.downloaded).toBe(0);
  expect(next.uploaded).toBe(0);
  expect(mocks.manifest).toHaveBeenCalledOnce();
  expect(mocks.downloadBatch).not.toHaveBeenCalled();
});
it("isolates large uploads so four workers cannot allocate four large files at once", async () => {
  const content = new Uint8Array(8 * 1024 * 1024 + 1);
  for (let index = 0; index < 3; index++)
    mocks.local.set(`large-${index}.bin`, content);
  let active = 0,
    peak = 0;
  mocks.upload.mockImplementation(
    async (_project, _device, _sandbox, path, value) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      mocks.remote.set(path, value);
      active--;
    },
  );
  expect(
    (await syncProjectWorkspace("project-bounded-upload-bytes")).uploaded,
  ).toBe(3);
  expect(peak).toBe(1);
});

it("uses the native cached manifest without reading each file on the JavaScript thread", async () => {
  mocks.local.set("a.txt", bytes("hello"));
  mocks.remote.set("a.txt", bytes("hello"));
  mocks.nativeManifest.mockResolvedValue({
    manifest: { "a.txt": sha256Bytes(bytes("hello")) },
    metrics: { hashed: 0, reused: 1, bytesHashed: 0, durationMs: 1 },
  });
  const result = await syncProjectWorkspace("native-cached");
  expect(result.uploaded + result.downloaded).toBe(0);
  expect(mocks.nativeManifest).toHaveBeenCalledWith(
    "native-cached",
    "sync-manifest",
    { allowedPaths: [] },
  );
  expect(mocks.readBytes).not.toHaveBeenCalled();
  expect(
    JSON.parse(
      mocks.savedCache.get("codaloud.terminal.last-sync.native-cached") ??
        "null",
    ),
  ).toMatchObject({
    durationMs: expect.any(Number),
    localScanMs: expect.any(Number),
    remoteScanMs: expect.any(Number),
    uploaded: 0,
    downloaded: 0,
  });
});
it("does not rewrite the common baseline when both workspaces are unchanged", async () => {
  const hash = sha256Bytes(bytes("hello"));
  mocks.local.set("a.txt", bytes("hello"));
  mocks.remote.set("a.txt", bytes("hello"));
  mocks.baseline = { "a.txt": hash };
  mocks.nativeManifest.mockResolvedValue({
    manifest: { "a.txt": hash },
    metrics: { hashed: 0, reused: 1, bytesHashed: 0, durationMs: 1 },
  });
  const result = await syncProjectWorkspace("native-no-op-baseline");
  expect(result.uploaded + result.downloaded + result.deleted).toBe(0);
  expect(mocks.writeBaseline).not.toHaveBeenCalled();
});
it("rejects an oversized persisted baseline before allocating a sync plan", async () => {
  mocks.baseline = Object.fromEntries(
    Array.from({ length: 100001 }, (_, index) => [
      String(index),
      "a".repeat(64),
    ]),
  );
  await expect(syncProjectWorkspace("oversized-baseline")).rejects.toThrow(
    /manifest/i,
  );
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.downloadBatch).not.toHaveBeenCalled();
});
it.each([null, [], { "a.txt": 42 }, { "a.txt": "invalid" }])(
  "rejects malformed native manifests without transferring files: %j",
  async (manifest) => {
    mocks.nativeManifest.mockResolvedValue({
      manifest,
      metrics: { hashed: 0, reused: 0, bytesHashed: 0, durationMs: 1 },
    });
    await expect(
      syncProjectWorkspace("malformed-native-manifest"),
    ).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.downloadBatch).not.toHaveBeenCalled();
  },
);
it("rejects edits during the native scan before starting transfers", async () => {
  const project = "native-race";
  mocks.nativeManifest.mockImplementation(async () => {
    const { notifyWorkspaceChanged } =
      await import("@/services/local-workspace/change-events");
    notifyWorkspaceChanged(project, ["a.txt"]);
    return {
      manifest: { "a.txt": sha256Bytes(bytes("hello")) },
      metrics: { hashed: 1, reused: 0, bytesHashed: 5, durationMs: 1 },
    };
  });
  await expect(syncProjectWorkspace(project)).rejects.toThrow(
    /changed while checking/,
  );
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("does not hide native scan failures by retrying with a slower scanner", async () => {
  mocks.nativeManifest.mockRejectedValue(
    new Error("device storage unavailable"),
  );
  await expect(syncProjectWorkspace("native-failed")).rejects.toThrow(
    "device storage unavailable",
  );
  expect(mocks.readBytes).not.toHaveBeenCalled();
});
it("restores hashes after a JS reload and invalidates same-size edits even with the same timestamp", async () => {
  const project = "project-persistent-hashes";
  mocks.local.set("a.txt", bytes("one"));
  mocks.local.set("b.txt", bytes("two"));
  mocks.modified.set("a.txt", 1234);
  mocks.modified.set("b.txt", 1234);
  await syncProjectWorkspace(project);
  mocks.baseline = JSON.parse(mocks.writeBaseline.mock.calls.at(-1)![1]);
  mocks.readBytes.mockClear();
  vi.resetModules();
  const reloaded = await import("../actions/sync-workspace");
  await reloaded.syncProjectWorkspace(project);
  expect(mocks.readBytes).not.toHaveBeenCalled();
  const { notifyWorkspaceChanged } =
    await import("@/services/local-workspace/change-events");
  mocks.local.set("a.txt", bytes("ONE"));
  notifyWorkspaceChanged(project, ["a.txt"]);
  mocks.readBytes.mockClear();
  const result = await reloaded.syncProjectWorkspace(project);
  expect(result.uploadedPaths).toEqual(["a.txt"]);
  expect(mocks.readBytes.mock.calls.every(([path]) => path === "a.txt")).toBe(
    true,
  );
});
