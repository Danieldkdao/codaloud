import { beforeEach, expect, it, vi } from "vitest";
import { sha256Bytes } from "@/lib/hashes";

const mocks = vi.hoisted(() => ({
  local: new Map<string, Uint8Array>(),
  remote: new Map<string, Uint8Array>(),
  baseline: {} as Record<string, string>,
  writeBaseline: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  flush: vi.fn(async () => {}),
  setSandboxId: vi.fn(),
}));
vi.mock("expo-file-system", () => ({
  Directory: class {
    create() {}
  },
  File: class {},
}));
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItem: async () => JSON.stringify(mocks.baseline),
    setItem: mocks.writeBaseline,
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
    get exists() {
      return mocks.local.has(path);
    },
    get size() {
      return mocks.local.get(path)?.byteLength ?? 0;
    },
    get modificationTime() {
      return mocks.local.has(path) ? 1 : null;
    },
    bytes: async () => mocks.local.get(path)!,
    create: () => mocks.local.set(path, new Uint8Array()),
    write: (bytes: Uint8Array) => mocks.local.set(path, bytes),
    delete: () => mocks.local.delete(path),
  }),
}));
vi.mock("../actions/terminal-client", () => ({
  getTerminalDeviceId: async () => "device",
  terminalApi: {
    ensure: async () => "sandbox-1",
    manifest: async () =>
      Object.fromEntries(
        [...mocks.remote].map(([path, bytes]) => [path, sha256Bytes(bytes)]),
      ),
    upload: mocks.upload,
    download: mocks.download,
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
  mocks.local.clear();
  mocks.remote.clear();
  mocks.baseline = {};
  mocks.upload.mockImplementation(
    async (_project, _device, _sandbox, path, value) => {
      mocks.remote.set(path, value);
    },
  );
  mocks.download.mockImplementation(async (_project, _device, _sandbox, path) =>
    mocks.remote.get(path),
  );
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

it("does not treat an unconfirmed upload as runnable", async () => {
  mocks.local.set("main.py", bytes("print(1)"));
  mocks.upload.mockResolvedValueOnce(undefined);
  const result = await syncProjectWorkspace("project-unconfirmed-upload");
  expect(result.failures).toEqual(["main.py"]);
  expect(result.failureReasons["main.py"]).toMatch(/not confirmed/i);
});
