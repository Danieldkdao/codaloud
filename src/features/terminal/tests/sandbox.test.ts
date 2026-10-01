import { hashWorkspaceManifest } from "../lib/manifest-hash";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Sandbox } from "@daytona/sdk";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  truncateSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
}));
vi.mock("@/data/env/server", () => ({
  serverEnv: { DAYTONA_API_KEY: "test", DAYTONA_TARGET: "test" },
}));

// The server module deliberately loads Daytona through CommonJS for Metro.
const { Daytona, DaytonaNotFoundError } =
  require("@daytona/sdk") as typeof import("@daytona/sdk");
import {
  ensureSandbox,
  checkedSandbox,
  readSandboxManifest,
  readSandboxManifestSnapshot,
  readSandboxFileHash,
  downloadSandboxFiles,
  findOwnedSandbox,
  deleteProjectSandbox,
} from "../server/sandbox";

const owner = {
  userId: "user",
  deviceId: "00000000-0000-4000-8000-000000000002",
  projectId: "00000000-0000-4000-8000-000000000001",
};

beforeEach(() => {
  vi.spyOn(Daytona.prototype, "get");
  vi.spyOn(Daytona.prototype, "start");
  vi.spyOn(Daytona.prototype, "create").mockResolvedValue({
    id: "replacement",
  } as Sandbox);
});
afterEach(() => vi.restoreAllMocks());

it("deletes an owned sandbox without starting or resizing it", async () => {
  const sandbox = {
    id: "deleted-project",
    state: "stopped",
    labels: {
      "codaloud.user": owner.userId,
      "codaloud.device": owner.deviceId,
      "codaloud.project": owner.projectId,
    },
  } as unknown as Sandbox;
  vi.mocked(Daytona.prototype.get).mockResolvedValue(sandbox);
  const remove = vi
    .spyOn(Daytona.prototype, "delete")
    .mockResolvedValue(undefined);

  await deleteProjectSandbox(sandbox.id, owner);
  expect(remove).toHaveBeenCalledWith(sandbox, 60);
  expect(Daytona.prototype.start).not.toHaveBeenCalled();
});

it.each(["user", "device", "project"])(
  "refuses sandbox cleanup when its %s owner differs",
  async (field) => {
    const sandbox = {
      id: "other-project",
      labels: {
        "codaloud.user": owner.userId,
        "codaloud.device": owner.deviceId,
        "codaloud.project": owner.projectId,
        [`codaloud.${field}`]: "other",
      },
    } as unknown as Sandbox;
    vi.mocked(Daytona.prototype.get).mockResolvedValue(sandbox);
    const remove = vi.spyOn(Daytona.prototype, "delete");
    await expect(deleteProjectSandbox(sandbox.id, owner)).rejects.toThrow(
      /does not belong/,
    );
    expect(remove).not.toHaveBeenCalled();
  },
);

it("treats an already deleted sandbox as completed cleanup", async () => {
  vi.mocked(Daytona.prototype.get).mockRejectedValue(
    new DaytonaNotFoundError("Not found", 404),
  );
  const remove = vi.spyOn(Daytona.prototype, "delete");
  await expect(findOwnedSandbox("missing", owner)).resolves.toBeNull();
  await expect(deleteProjectSandbox("missing", owner)).resolves.toBeUndefined();
  expect(remove).not.toHaveBeenCalled();
});

it("retries temporary sandbox cleanup failures instead of treating them as missing", async () => {
  vi.mocked(Daytona.prototype.get).mockRejectedValue(
    new Error("Daytona unavailable"),
  );
  await expect(
    deleteProjectSandbox("temporary-failure", owner),
  ).rejects.toThrow("Daytona unavailable");
});

it("keeps the original sandbox ID after a temporary lookup failure", async () => {
  vi.mocked(Daytona.prototype.get).mockRejectedValue(
    new Error("Daytona unavailable"),
  );
  await expect(ensureSandbox(owner, "original")).rejects.toThrow(
    "Daytona unavailable",
  );
  expect(Daytona.prototype.create).not.toHaveBeenCalled();
});

it("keeps the original sandbox ID after a temporary start failure", async () => {
  vi.mocked(Daytona.prototype.get).mockResolvedValue({
    id: "original",
    state: "stopped",
    cpu: 2,
    memory: 4,
    setAutostopInterval: vi.fn().mockResolvedValue(undefined),
    labels: {
      "codaloud.user": owner.userId,
      "codaloud.device": owner.deviceId,
      "codaloud.project": owner.projectId,
    },
  } as unknown as Sandbox);
  vi.mocked(Daytona.prototype.start).mockRejectedValue(
    new Error("Start timed out"),
  );
  await expect(ensureSandbox(owner, "original")).rejects.toThrow(
    "Start timed out",
  );
  expect(Daytona.prototype.create).not.toHaveBeenCalled();
});

it.each(["starting", "stopping"] as const)(
  "waits for a sandbox that is %s before configuring or starting it",
  async (state) => {
    const sandbox = {
      id: "transitioning",
      state: state as string,
      cpu: 2,
      memory: 4,
      autoStopInterval: 10,
      updatedAt: "version-1",
      labels: {
        "codaloud.user": owner.userId,
        "codaloud.device": owner.deviceId,
        "codaloud.project": owner.projectId,
      },
      setAutostopInterval: vi.fn(async () => {
        if (["starting", "stopping"].includes(sandbox.state))
          throw new Error("Sandbox state change in progress");
      }),
      waitUntilStarted: vi.fn(async () => {
        sandbox.state = "started";
      }),
      waitUntilStopped: vi.fn(async () => {
        sandbox.state = "stopped";
      }),
    };
    vi.mocked(Daytona.prototype.get).mockResolvedValue(
      sandbox as unknown as Sandbox,
    );
    vi.mocked(Daytona.prototype.start).mockResolvedValue(undefined);
    const onStart = vi.fn().mockResolvedValue(undefined);
    await expect(ensureSandbox(owner, sandbox.id, onStart)).resolves.toBe(
      sandbox,
    );
    expect(
      state === "starting"
        ? sandbox.waitUntilStarted
        : sandbox.waitUntilStopped,
    ).toHaveBeenCalledWith(expect.any(Number));
    expect(Daytona.prototype.start).toHaveBeenCalledTimes(
      state === "starting" ? 0 : 1,
    );
    expect(onStart).toHaveBeenCalledOnce();
    expect(Daytona.prototype.create).not.toHaveBeenCalled();
  },
);

it.each(["starting", "started"] as const)(
  "joins a concurrent start when the SDK reports a state race and refresh finds %s",
  async (nextState) => {
    const sandbox = {
      id: "start-race",
      state: "stopped" as string,
      cpu: 2,
      memory: 4,
      autoStopInterval: 5,
      updatedAt: "version-1",
      labels: {
        "codaloud.user": owner.userId,
        "codaloud.device": owner.deviceId,
        "codaloud.project": owner.projectId,
      },
      refreshData: vi.fn(async () => {
        sandbox.state = nextState;
      }),
      waitUntilStarted: vi.fn(async () => {
        sandbox.state = "started";
      }),
    };
    vi.mocked(Daytona.prototype.get).mockResolvedValue(
      sandbox as unknown as Sandbox,
    );
    vi.mocked(Daytona.prototype.start).mockRejectedValue(
      new Error("Sandbox state change in progress"),
    );
    const onStart = vi.fn().mockResolvedValue(undefined);
    await expect(ensureSandbox(owner, sandbox.id, onStart)).resolves.toBe(
      sandbox,
    );
    expect(sandbox.refreshData).toHaveBeenCalledOnce();
    expect(sandbox.waitUntilStarted).toHaveBeenCalledTimes(
      nextState === "starting" ? 1 : 0,
    );
    expect(Daytona.prototype.start).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
    expect(Daytona.prototype.create).not.toHaveBeenCalled();
  },
);

it("recreates only a confirmed missing sandbox", async () => {
  vi.mocked(Daytona.prototype.get).mockRejectedValue(
    new DaytonaNotFoundError("Not found", 404),
  );
  await expect(ensureSandbox(owner, "original")).resolves.toMatchObject({
    id: "replacement",
  });
  expect(Daytona.prototype.create).toHaveBeenCalledOnce();
  expect(Daytona.prototype.create).toHaveBeenCalledWith(
    expect.objectContaining({
      autoStopInterval: 5,
    }),
  );
});

it("creates a 4 GiB terminal sandbox using the medium snapshot without resource overrides", async () => {
  vi.mocked(Daytona.prototype.create).mockImplementation(async (params) => {
    if (params && "resources" in params)
      throw new Error("Cannot specify Sandbox resources when using a snapshot");
    return { id: "new-sandbox" } as Sandbox;
  });

  await expect(ensureSandbox(owner, null)).resolves.toMatchObject({
    id: "new-sandbox",
  });
  const [params] = vi.mocked(Daytona.prototype.create).mock.calls[0];
  expect(params).toHaveProperty("snapshot", "daytona-medium");
  expect(params).not.toHaveProperty("resources");
});

it("restarts and charges an oversized running sandbox after reducing resources", async () => {
  const sandbox = {
    id: "original",
    state: "started",
    cpu: 4,
    memory: 8,
    updatedAt: "version-1",
    autoStopInterval: 5,
    resize: vi.fn().mockResolvedValue(undefined),
    labels: {
      "codaloud.user": owner.userId,
      "codaloud.device": owner.deviceId,
      "codaloud.project": owner.projectId,
    },
  } as unknown as Sandbox;
  vi.mocked(Daytona.prototype.get).mockResolvedValue(sandbox);
  const stop = vi.spyOn(Daytona.prototype, "stop").mockResolvedValue(undefined);
  vi.mocked(Daytona.prototype.start).mockResolvedValue(undefined);
  const onStart = vi.fn().mockResolvedValue(undefined);

  await expect(ensureSandbox(owner, sandbox.id, onStart)).resolves.toBe(
    sandbox,
  );
  expect(stop).toHaveBeenCalledWith(sandbox);
  expect(sandbox.resize).toHaveBeenCalledWith({ cpu: 2, memory: 4 });
  expect(Daytona.prototype.start).toHaveBeenCalledWith(sandbox, 90);
  expect(onStart).toHaveBeenCalledWith(sandbox, "version-1");
});

it.each(["started", "stopped"])(
  "gives an undersized %s sandbox the terminal's 2 CPU and 4 GiB allocation",
  async (state) => {
    const sandbox = {
      id: "undersized",
      state,
      cpu: 1,
      memory: 1,
      autoStopInterval: 5,
      updatedAt: "before-resize",
      labels: {
        "codaloud.user": owner.userId,
        "codaloud.device": owner.deviceId,
        "codaloud.project": owner.projectId,
      },
      resize: vi.fn().mockResolvedValue(undefined),
    } as unknown as Sandbox;
    vi.mocked(Daytona.prototype.get).mockResolvedValue(sandbox);
    vi.mocked(Daytona.prototype.start).mockResolvedValue(undefined);
    const stop = vi
      .spyOn(Daytona.prototype, "stop")
      .mockResolvedValue(undefined);
    const charge = vi.fn().mockResolvedValue(undefined);

    await expect(checkedSandbox(sandbox.id, owner, charge)).resolves.toBe(
      sandbox,
    );
    expect(sandbox.resize).toHaveBeenCalledWith({ cpu: 2, memory: 4 });
    expect(stop).not.toHaveBeenCalled();
    expect(Daytona.prototype.start).toHaveBeenCalledTimes(
      state === "stopped" ? 1 : 0,
    );
    expect(charge).toHaveBeenCalledTimes(state === "stopped" ? 1 : 0);
  },
);

it("keeps a legacy workspace usable when Daytona has not deployed its resize endpoint", async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const sandbox = {
    id: "legacy",
    state: "started",
    cpu: 1,
    memory: 1,
    autoStopInterval: 5,
    labels: {
      "codaloud.user": owner.userId,
      "codaloud.device": owner.deviceId,
      "codaloud.project": owner.projectId,
    },
    resize: vi
      .fn()
      .mockRejectedValue(
        new DaytonaNotFoundError("Cannot POST /api/sandbox/legacy/resize", 404),
      ),
  } as unknown as Sandbox;
  vi.mocked(Daytona.prototype.get).mockResolvedValue(sandbox);

  await expect(ensureSandbox(owner, sandbox.id)).resolves.toBe(sandbox);
  await expect(ensureSandbox(owner, sandbox.id)).resolves.toBe(sandbox);
  expect(sandbox.resize).toHaveBeenCalledOnce();
  expect(Daytona.prototype.create).not.toHaveBeenCalled();
  expect(Daytona.prototype.start).not.toHaveBeenCalled();

  clock.mockReturnValue(now + 5 * 60_000 + 1);
  vi.mocked(sandbox.resize).mockResolvedValueOnce(undefined);
  await expect(ensureSandbox(owner, sandbox.id)).resolves.toBe(sandbox);
  expect(sandbox.resize).toHaveBeenCalledTimes(2);
});

it("does not mistake a disappeared sandbox for an unsupported resize endpoint", async () => {
  const sandbox = {
    id: "missing-during-resize",
    state: "started",
    cpu: 1,
    memory: 1,
    labels: {
      "codaloud.user": owner.userId,
      "codaloud.device": owner.deviceId,
      "codaloud.project": owner.projectId,
    },
    resize: vi
      .fn()
      .mockRejectedValue(new DaytonaNotFoundError("Not found", 404)),
  } as unknown as Sandbox;
  vi.mocked(Daytona.prototype.get).mockResolvedValue(sandbox);

  await expect(ensureSandbox(owner, sandbox.id)).rejects.toThrow("Not found");
  expect(Daytona.prototype.create).not.toHaveBeenCalled();
});

it("scans only the selected nested dependency folder", async () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-manifest-"));
  try {
    mkdirSync(join(root, "node_modules", "selected"), { recursive: true });
    mkdirSync(join(root, "node_modules", "other"), { recursive: true });
    writeFileSync(
      join(root, "node_modules", "selected", "index.d.ts"),
      "export type Selected = true;",
    );
    writeFileSync(
      join(root, "node_modules", "other", "index.d.ts"),
      "export type Other = true;",
    );
    const sandbox = {
      process: {
        executeCommand: async (command: string) => ({
          exitCode: 0,
          result: execSync(command, { encoding: "utf8" }),
        }),
      },
    } as unknown as Sandbox;
    const manifest = await readSandboxManifest(sandbox, root, [
      "node_modules/selected",
    ]);
    expect(Object.keys(manifest)).toEqual(["node_modules/selected/index.d.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("omits large files normally and includes them when selected", async () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-large-manifest-"));
  try {
    const path = join(root, "large.bin");
    writeFileSync(path, "");
    truncateSync(path, 33 * 1024 * 1024);
    const sandbox = {
      process: {
        executeCommand: async (command: string) => ({
          exitCode: 0,
          result: execSync(command, { encoding: "utf8" }),
        }),
      },
    } as unknown as Sandbox;
    expect(await readSandboxManifest(sandbox, root)).toEqual({});
    expect(
      await readSandboxManifest(sandbox, root, ["large.bin"]),
    ).toHaveProperty("large.bin");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("rehashes only changed sandbox files across requests and recovers a corrupt cache", async () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-cached-manifest-"));
  const stats: { hashed: number; reused: number }[] = [];
  const sandbox = {
    process: {
      executeCommand: async (command: string) => ({
        exitCode: 0,
        result: execSync(command, { encoding: "utf8" }),
      }),
    },
  } as unknown as Sandbox;
  try {
    writeFileSync(join(root, "a.txt"), "one");
    writeFileSync(join(root, "b.txt"), "two");
    const first = await readSandboxManifest(sandbox, root, [], (value) =>
      stats.push(value),
    );
    expect(stats.at(-1)).toMatchObject({ hashed: 2, reused: 0 });
    expect(
      await readSandboxManifest(sandbox, root, [], (value) =>
        stats.push(value),
      ),
    ).toEqual(first);
    expect(stats.at(-1)).toMatchObject({ hashed: 0, reused: 2 });
    writeFileSync(join(root, "a.txt"), "ONE");
    const changed = await readSandboxManifest(sandbox, root, [], (value) =>
      stats.push(value),
    );
    expect(changed["a.txt"]).not.toBe(first["a.txt"]);
    expect(stats.at(-1)).toMatchObject({ hashed: 1, reused: 1 });
    rmSync(join(root, "b.txt"));
    expect(await readSandboxManifest(sandbox, root)).not.toHaveProperty(
      "b.txt",
    );
    const cachePath = join(
      dirname(root),
      `.codaloud-sync-${createHash("sha256").update(root).digest("hex")}.json`,
    );
    writeFileSync(cachePath, "corrupt JSON");
    expect(
      await readSandboxManifest(sandbox, root, [], (value) =>
        stats.push(value),
      ),
    ).toEqual({ "a.txt": changed["a.txt"] });
    expect(stats.at(-1)).toMatchObject({ hashed: 1, reused: 0 });
    rmSync(cachePath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("ignores an oversized sandbox cache before parsing it", async () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-cache-limit-"));
  const cachePath = join(
    dirname(root),
    `.codaloud-sync-${createHash("sha256").update(root).digest("hex")}.json`,
  );
  try {
    writeFileSync(join(root, "a.txt"), "hello");
    writeFileSync(cachePath, "");
    truncateSync(cachePath, 33 * 1024 * 1024);
    const sandbox = {
      process: {
        executeCommand: async (command: string) => ({
          exitCode: 0,
          result: execSync(
            command.replace("node -e", "node --max-old-space-size=32 -e"),
            { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
          ),
        }),
      },
    } as unknown as Sandbox;
    // Valid JSON with padding would otherwise parse and use a forged hint.
    const stat = lstatSync(join(root, "a.txt"), { bigint: true });
    const key = [
      stat.size,
      stat.mtimeNs,
      stat.ctimeNs,
      stat.ino,
      stat.mode,
    ].join(":");
    const content = JSON.stringify({
      version: 1,
      files: { "a.txt": { key, hash: "0".repeat(64) } },
    });
    writeFileSync(cachePath, content.padEnd(33 * 1024 * 1024, " "));
    let metrics;
    const manifest = await readSandboxManifest(sandbox, root, [], (value) => {
      metrics = value;
    });
    expect(manifest["a.txt"]).toBe(
      createHash("sha256").update("hello").digest("hex"),
    );
    expect(metrics).toMatchObject({ hashed: 1, reused: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(cachePath, { force: true });
  }
});

it("downloads small dependencies together while isolating large, missing and symlink paths", async () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-batch-"));
  try {
    writeFileSync(join(root, "a.js"), "one");
    writeFileSync(join(root, "b.js"), "two");
    writeFileSync(join(root, "large.bin"), "");
    truncateSync(join(root, "large.bin"), 9 * 1024 * 1024);
    symlinkSync(join(root, "a.js"), join(root, "link.js"));
    const downloadFiles = vi.fn(async (files: { source: string }[]) =>
      files.map((file) => ({
        source: file.source,
        result: readFileSync(file.source),
      })),
    );
    const sandbox = {
      process: {
        executeCommand: async (command: string) => ({
          exitCode: 0,
          result: execSync(command, { encoding: "utf8" }),
        }),
      },
      fs: { downloadFiles },
    } as unknown as Sandbox;
    const files = await downloadSandboxFiles(sandbox, root, [
      "a.js",
      "b.js",
      "large.bin",
      "missing.js",
      "link.js",
    ]);
    expect(files[0]).toEqual({ path: "a.js", bytes: Buffer.from("one") });
    expect(files[1]).toEqual({ path: "b.js", bytes: Buffer.from("two") });
    expect(files[2]).toEqual({
      path: "large.bin",
      individual: true,
      fileSize: 9 * 1024 * 1024,
    });
    expect(files[3]).toMatchObject({
      path: "missing.js",
      error: expect.stringContaining("ENOENT"),
    });
    expect(files[4]).toMatchObject({
      path: "link.js",
      error: expect.stringContaining("Symbolic links"),
    });
    expect(downloadFiles).toHaveBeenCalledOnce();
    expect(downloadFiles.mock.calls[0][0]).toHaveLength(2);
    await expect(
      downloadSandboxFiles(sandbox, root, ["../outside"]),
    ).rejects.toThrow("Invalid workspace path");
    await expect(
      downloadSandboxFiles(sandbox, root, [".git/config"]),
    ).rejects.toThrow("Invalid workspace path");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("reports overflow sizes so small files can be downloaded in another bounded batch", async () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-overflow-"));
  try {
    const paths = Array.from({ length: 8 }, (_, index) => `${index}.bin`);
    for (const path of paths) {
      writeFileSync(join(root, path), "");
      truncateSync(join(root, path), 2 * 1024 * 1024);
    }
    const sandbox = {
      process: {
        executeCommand: async (command: string) => ({
          exitCode: 0,
          result: execSync(command, { encoding: "utf8" }),
        }),
      },
      fs: {
        downloadFiles: async (files: { source: string }[]) =>
          files.map((file) => ({
            source: file.source,
            result: readFileSync(file.source),
          })),
      },
    } as unknown as Sandbox;
    const files = await downloadSandboxFiles(sandbox, root, paths);
    expect(files.slice(4)).toEqual(
      paths
        .slice(4)
        .map((path) => ({ path, individual: true, fileSize: 2 * 1024 * 1024 })),
    );
    const retry = await downloadSandboxFiles(sandbox, root, paths.slice(4));
    expect(retry.every((file) => "bytes" in file)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("hashes selected large files with bounded reads and rejects symlink hash targets", async () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-hash-"));
  try {
    const file = join(root, "large.bin");
    writeFileSync(file, "");
    truncateSync(file, 33 * 1024 * 1024);
    const guard = join(root, "guard.cjs");
    writeFileSync(
      guard,
      `const fs=require('fs'),read=fs.readFileSync;fs.readFileSync=(name,...args)=>{if(String(name).endsWith('/large.bin'))throw Error('Unbounded file read');return read(name,...args)}`,
    );
    const sandbox = {
      process: {
        executeCommand: async (command: string) => ({
          exitCode: 0,
          result: execSync(command, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, NODE_OPTIONS: `--require ${guard}` },
          }),
        }),
      },
    } as unknown as Sandbox;
    const digest = createHash("sha256");
    const chunk = Buffer.alloc(256 * 1024);
    for (let count = 0; count < 132; count++) digest.update(chunk);
    expect(await readSandboxFileHash(sandbox, root, "large.bin")).toBe(
      digest.digest("hex"),
    );
    symlinkSync(file, join(root, "link.bin"));
    await expect(
      readSandboxFileHash(sandbox, root, "link.bin"),
    ).rejects.toThrow();
    expect(await readSandboxFileHash(sandbox, root, "missing.bin")).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("shares one sandbox startup between concurrent sync requests and checks every owner", async () => {
  const sandbox = {
    id: "concurrent-start",
    state: "stopped",
    cpu: 2,
    memory: 4,
    autoStopInterval: 5,
    updatedAt: "before",
    labels: {
      "codaloud.user": owner.userId,
      "codaloud.device": owner.deviceId,
      "codaloud.project": owner.projectId,
    },
  } as unknown as Sandbox;
  vi.mocked(Daytona.prototype.get).mockResolvedValue(sandbox);
  let release!: () => void;
  vi.mocked(Daytona.prototype.start).mockImplementation(
    () =>
      new Promise<void>((done) => {
        release = done;
      }),
  );
  const charge = vi.fn(async () => {});
  const first = checkedSandbox(sandbox.id, owner, charge);
  const second = checkedSandbox(sandbox.id, owner, charge);
  await vi.waitFor(() => expect(Daytona.prototype.start).toHaveBeenCalled());
  await expect(
    checkedSandbox(sandbox.id, { ...owner, userId: "other" }, charge),
  ).rejects.toThrow(/does not belong/);
  expect(Daytona.prototype.start).toHaveBeenCalledOnce();
  release();
  await Promise.all([first, second]);
  expect(charge).toHaveBeenCalledOnce();
});

it("returns a small confirmation for a matching fingerprint and a complete manifest after edits", async () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-conditional-manifest-"));
  const cachePath = join(
    dirname(root),
    `.codaloud-sync-${createHash("sha256").update(root).digest("hex")}.json`,
  );
  let outputBytes = 0;
  const sandbox = {
    process: {
      executeCommand: async (command: string) => {
        const result = execSync(command, { encoding: "utf8" });
        outputBytes = Buffer.byteLength(result);
        return { exitCode: 0, result };
      },
    },
  } as unknown as Sandbox;
  try {
    for (let index = 0; index < 1000; index++)
      writeFileSync(join(root, `${index}.txt`), "hello");
    const first = await readSandboxManifestSnapshot(sandbox, root);
    expect(first.unchanged).toBe(false);
    expect(outputBytes).toBeGreaterThan(64000);
    expect(await hashWorkspaceManifest(first.manifest!)).toBe(first.hash);
    const next = await readSandboxManifestSnapshot(
      sandbox,
      root,
      [],
      first.hash,
    );
    expect(next.unchanged).toBe(true);
    expect(next.manifest).toBeUndefined();
    expect(next.metrics.hashed).toBe(0);
    expect(outputBytes).toBeLessThan(1024);
    writeFileSync(join(root, "0.txt"), "world");
    const edited = await readSandboxManifestSnapshot(
      sandbox,
      root,
      [],
      first.hash,
    );
    expect(edited.unchanged).toBe(false);
    expect(edited.hash).not.toBe(first.hash);
    expect(edited.manifest?.["0.txt"]).toBe(
      createHash("sha256").update("world").digest("hex"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(cachePath, { force: true });
  }
});
