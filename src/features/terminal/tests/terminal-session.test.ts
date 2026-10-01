import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  ensure: vi.fn(),
  manifest: vi.fn(),
  autoReady: true,
  sockets: [] as Array<{
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onmessage: ((event: { data: string }) => void) | null;
  }>,
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));
vi.mock("../actions/terminal-client", () => ({
  TerminalAccessError: class extends Error {
    constructor(
      message: string,
      readonly requirement: "plan" | "credits" | "billing",
    ) {
      super(message);
    }
  },
  getTerminalDeviceId: async () => "device",
  terminalApi: {
    manifest: mocks.manifest,
    ticket: async () => ({
      ticket: "ticket",
      url: "wss://example.test/terminal",
    }),
  },
}));
vi.mock("../actions/sync-workspace", () => ({
  syncProjectWorkspace: mocks.sync,
  ensureProjectSandbox: mocks.ensure,
}));

import { ProjectTerminalSession } from "../actions/terminal-session";
import { TerminalAccessError } from "../actions/terminal-client";
import { notifyWorkspaceChanged } from "@/services/local-workspace/change-events";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sockets.length = 0;
  mocks.autoReady = true;
  mocks.ensure.mockResolvedValue("sandbox");
  mocks.sync.mockResolvedValue({
    sandboxId: "sandbox",
    allowedPaths: [],
    remoteManifest: {},
    conflicts: [],
    failures: [],
    uploaded: 0,
    downloaded: 0,
    deleted: 0,
    localDeleted: 0,
    downloadedPaths: [],
    localDeletedPaths: [],
  });
  mocks.manifest.mockResolvedValue({});
  vi.stubGlobal(
    "WebSocket",
    class {
      static OPEN = 1;
      readyState = 1;
      send = vi.fn();
      close = vi.fn();
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror = null;
      onclose = null;
      constructor() {
        mocks.sockets.push(this);
        if (mocks.autoReady)
          queueMicrotask(() =>
            this.onmessage?.({ data: JSON.stringify({ type: "ready" }) }),
          );
      }
    },
  );
});

it("waits for PTY readiness before delivering input to an open socket", async () => {
  mocks.autoReady = false;
  const session = new ProjectTerminalSession("project");
  const connecting = session.connect();
  await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1));
  const sending = session.sendInput("echo ready\n");
  await Promise.resolve();
  expect(mocks.sockets[0].send).not.toHaveBeenCalled();
  mocks.sockets[0].onmessage?.({ data: JSON.stringify({ type: "ready" }) });
  await Promise.all([connecting, sending]);
  expect(mocks.sockets[0].send).toHaveBeenCalledWith(
    JSON.stringify({ type: "input", data: "echo ready\n" }),
  );
  session.disconnect();
});

it("opens the terminal while dependency files are still downloading", async () => {
  let finish!: (value: unknown) => void;
  mocks.sync.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const session = new ProjectTerminalSession("project-heavy-download");
  const connecting = session.connect();
  try {
    await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1), {
      timeout: 200,
    });
    expect(session.getSnapshot().status).toBe("ready");
  } finally {
    finish({
      sandboxId: "sandbox",
      allowedPaths: [],
      remoteManifest: {},
      conflicts: [],
      failures: [],
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      localDeleted: 0,
      downloadedPaths: [],
      localDeletedPaths: [],
    });
    await connecting;
    session.disconnect();
  }
});

it("forwards every typed command chunk in order, including spaces and quotes", async () => {
  mocks.autoReady = false;
  const session = new ProjectTerminalSession("project");
  const first = session.sendInput("printf '%s' 'created");
  const second = session.sendInput(" from terminal' > note.txt\n");
  await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1));
  mocks.sockets[0].onmessage?.({ data: JSON.stringify({ type: "ready" }) });
  await Promise.all([first, second]);
  const sent = mocks.sockets[0].send.mock.calls.map(
    ([value]) => JSON.parse(value).data,
  );
  expect(sent.join("")).toBe(
    "printf '%s' 'created from terminal' > note.txt\n",
  );
  session.disconnect();
});

it("keeps a paid-plan denial visible instead of retrying on terminal resize", async () => {
  mocks.ensure.mockRejectedValue(
    new TerminalAccessError(
      "A paid plan is required for the terminal.",
      "plan",
    ),
  );
  const session = new ProjectTerminalSession("project");

  await expect(session.connect()).rejects.toThrow("paid plan");
  await expect(session.resize(80, 24)).rejects.toThrow("paid plan");

  expect(mocks.ensure).toHaveBeenCalledOnce();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({
    status: "blocked",
    access: "plan",
    error: "A paid plan is required for the terminal.",
  });
  expect(mocks.sockets).toHaveLength(0);
});

it("connects after the user explicitly retries a resolved plan denial", async () => {
  mocks.ensure.mockRejectedValueOnce(
    new TerminalAccessError(
      "A paid plan is required for the terminal.",
      "plan",
    ),
  );
  const session = new ProjectTerminalSession("project");

  await expect(session.connect()).rejects.toThrow("paid plan");
  await session.retry();

  expect(mocks.ensure).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot()).toMatchObject({
    status: "ready",
    access: null,
    error: null,
  });
  session.disconnect();
});

it("allows an agent command after a successful sync confirms upgraded access", async () => {
  mocks.ensure.mockRejectedValueOnce(
    new TerminalAccessError(
      "A paid plan is required for the terminal.",
      "plan",
    ),
  );
  const session = new ProjectTerminalSession("project");
  await expect(session.connect()).rejects.toThrow("paid plan");

  const prepared = await session.sync();
  await session.connect(prepared);

  expect(mocks.ensure).toHaveBeenCalledOnce();
  expect(mocks.sync).toHaveBeenCalledOnce();
  expect(session.getSnapshot()).toMatchObject({
    status: "ready",
    access: null,
    error: null,
  });
  session.disconnect();
});

it("replaces a failed open socket when the user retries", async () => {
  const session = new ProjectTerminalSession("project");
  await session.connect();
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({ type: "error", data: "Terminal unavailable." }),
  });

  await session.retry();

  expect(mocks.sockets).toHaveLength(2);
  expect(mocks.sockets[0].close).toHaveBeenCalledOnce();
  expect(session.getSnapshot().status).toBe("ready");
  session.disconnect();
});
it("shows a credit denial from the gateway as a stable billing block", async () => {
  const session = new ProjectTerminalSession("project");
  await session.connect();
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({
      type: "billing",
      data: { reason: "credits", message: "Add credits to use the terminal." },
    }),
  });
  expect(session.getSnapshot()).toMatchObject({
    status: "blocked",
    access: "credits",
    error: "Add credits to use the terminal.",
  });
  await expect(session.connect()).rejects.toThrow("Add credits");
  session.disconnect();
});

it("shows submitted commands beside their streamed results in order", async () => {
  const session = new ProjectTerminalSession("project");
  await session.sendInput("printf one\\n\n", undefined, "printf one\\n");
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({ type: "data", data: "one\n" }),
  });
  await session.sendInput("pwd\n", undefined, "pwd");
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({ type: "data", data: "/home/daytona\n" }),
  });
  expect(session.getSnapshot().output).toContain(
    "$ printf one\\n\none\n$ pwd\n/home/daytona\n",
  );
  session.disconnect();
});

it("preserves PTY control sequences for the native terminal and clears its replay", async () => {
  const session = new ProjectTerminalSession("project");
  const chunks: string[] = [];
  const unsubscribe = session.subscribeRawOutput((chunk) => chunks.push(chunk));
  await session.connect();
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({
      type: "data",
      data: "\u001b[31mred\u001b[0m\r\n",
    }),
  });
  expect(chunks).toEqual(["\u001b[31mred\u001b[0m\r\n"]);
  expect(session.getRawOutput()).toBe("\u001b[31mred\u001b[0m\r\n");
  expect(session.getSnapshot().output).toBe("red\n");
  session.clear();
  expect(session.getRawOutput()).toBe("");
  expect(session.getSnapshot().clearGeneration).toBe(1);
  unsubscribe();
  session.disconnect();
});

it("shows the reason for a failed sync and accounts for every omitted filename", async () => {
  mocks.sync.mockResolvedValueOnce({
    sandboxId: "sandbox",
    conflicts: ["a.ts"],
    failures: ["b.ts", "c.ts", "d.ts"],
    failureReasons: { "b.ts": "Upload rejected" },
    uploaded: 0,
    downloaded: 0,
    deleted: 0,
    localDeleted: 0,
    downloadedPaths: [],
    localDeletedPaths: [],
  });
  const session = new ProjectTerminalSession("project");
  await session.sync();
  expect(session.getSnapshot().syncMessage).toContain("4 files need attention");
  expect(session.getSnapshot().syncMessage).toContain("b.ts (Upload rejected)");
  expect(session.getSnapshot().syncMessage).toContain("and 1 more");
});

it("shows a stable syncing state until file transfer settles", async () => {
  let finish!: (value: unknown) => void;
  mocks.sync.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const session = new ProjectTerminalSession("project");
  const running = session.sync();
  expect(session.getSnapshot()).toMatchObject({
    syncing: true,
    syncMessage: expect.stringMatching(/syncing/i),
  });
  finish({
    sandboxId: "sandbox",
    conflicts: [],
    failures: [],
    failureReasons: {},
    uploaded: 1,
    uploadedPaths: ["src/new.ts"],
    downloaded: 0,
    deleted: 0,
    localDeleted: 0,
    downloadedPaths: [],
    localDeletedPaths: [],
  });
  await running;
  expect(session.getSnapshot()).toMatchObject({
    syncing: false,
    syncMessage: expect.stringMatching(/uploaded 1/i),
  });
});

it("syncs device changes while a terminal panel is open and shows progress", async () => {
  const session = new ProjectTerminalSession("project-changed");
  const releasePanel = session.retainPanel();
  await session.connect();
  mocks.sync.mockClear();
  vi.useFakeTimers();
  try {
    notifyWorkspaceChanged("project-changed");
    expect(session.getSnapshot()).toMatchObject({
      syncing: true,
      syncMessage: expect.stringMatching(/device files changed/i),
    });
    await vi.advanceTimersByTimeAsync(650);
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(session.getSnapshot().syncing).toBe(false);
  } finally {
    vi.useRealTimers();
    releasePanel();
  }
});

it("does not sync again when the terminal only redraws its prompt", async () => {
  const session = new ProjectTerminalSession("project");
  await session.connect();
  mocks.sync.mockClear();
  vi.useFakeTimers();
  try {
    mocks.sockets[0].onmessage?.({
      data: JSON.stringify({ type: "data", data: "$ " }),
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(mocks.manifest).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(session.getSnapshot().syncing).toBe(false);
  } finally {
    vi.useRealTimers();
    session.disconnect();
  }
});

it("syncs terminal edits only after its remote manifest changes", async () => {
  const session = new ProjectTerminalSession("project");
  await session.connect();
  mocks.sync.mockClear();
  vi.useFakeTimers();
  try {
    await session.sendInput("echo hello\n");
    mocks.sockets[0].onmessage?.({
      data: JSON.stringify({ type: "data", data: "hello\n$ " }),
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(mocks.manifest).toHaveBeenCalledOnce();
    expect(mocks.manifest).toHaveBeenCalledWith(
      "project",
      "device",
      "sandbox",
      [],
      {},
    );
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(session.getSnapshot().syncing).toBe(false);

    const changed = { "note.txt": "a".repeat(64) };
    mocks.manifest.mockResolvedValueOnce(changed);
    mocks.sync.mockResolvedValueOnce({
      sandboxId: "sandbox",
      allowedPaths: [],
      remoteManifest: changed,
      conflicts: [],
      failures: [],
      uploaded: 0,
      downloaded: 1,
      deleted: 0,
      localDeleted: 0,
      downloadedPaths: ["note.txt"],
      localDeletedPaths: [],
    });
    await session.sendInput("touch note.txt\n");
    await vi.advanceTimersByTimeAsync(4000);
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(session.getSnapshot().syncing).toBe(false);
  } finally {
    vi.useRealTimers();
    session.disconnect();
  }
});

it("checks a new command sent while a manifest request is still in flight", async () => {
  const session = new ProjectTerminalSession("project");
  await session.connect();
  mocks.sync.mockClear();
  let finishManifest!: (manifest: Record<string, string>) => void;
  mocks.manifest.mockImplementationOnce(
    () =>
      new Promise<Record<string, string>>((resolve) => {
        finishManifest = resolve;
      }),
  );
  vi.useFakeTimers();
  try {
    await session.sendInput("echo first\n");
    await vi.advanceTimersByTimeAsync(3500);
    expect(mocks.manifest).toHaveBeenCalledOnce();

    await session.sendInput("touch second.txt\n");
    finishManifest({});
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3500);

    expect(mocks.manifest).toHaveBeenCalledTimes(2);
    expect(mocks.sync).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    session.disconnect();
  }
});

it("keeps Run active until its PTY completion marker arrives", async () => {
  const session = new ProjectTerminalSession("project");
  const chunks: string[] = [];
  session.subscribeRawOutput((chunk) => chunks.push(chunk));
  const running = session.runInPty("python3 'a.py'\n");
  await vi.waitFor(() => expect(mocks.sockets[0]?.send).toHaveBeenCalled());
  const sent = JSON.parse(mocks.sockets[0].send.mock.lastCall![0]);
  expect(sent.data).toContain("python3 'a.py'");
  expect(sent.data).not.toContain("__CODALOUD_DONE_00000000");
  expect(session.getSnapshot().output).toContain("$ python3 'a.py'");
  expect(session.getSnapshot().output).not.toContain("CODALOUD_DONE");
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({ type: "data", data: "hello\n__CODA" }),
  });
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({
      type: "data",
      data: "LOUD_DONE_00000000-0000-4000-8000-000000000001__\n",
    }),
  });
  await running;
  expect(session.getSnapshot().output).toContain("hello");
  expect(session.getSnapshot().output).not.toContain("CODALOUD_DONE");
  expect(chunks.join("")).toContain("hello");
  expect(chunks.join("")).not.toContain("CODALOUD_DONE");
  expect(session.getRawOutput()).not.toContain("CODALOUD_DONE");
  session.disconnect();
});
afterEach(() => vi.unstubAllGlobals());

it("keeps an agent command alive when its panel closes, then releases the socket", async () => {
  const session = new ProjectTerminalSession("project");
  const releasePanel = session.retainPanel();
  await session.connect();
  const pending = session.runCommand("npm test", 30);
  await vi.waitFor(() => expect(mocks.sockets[0].send).toHaveBeenCalled());
  releasePanel();
  expect(mocks.sockets[0].close).not.toHaveBeenCalled();
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({
      type: "commandResult",
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        exitCode: 0,
        output: "passed",
      },
    }),
  });
  expect(await pending).toEqual({ exitCode: 0, output: "passed" });
  expect(mocks.sockets[0].close).toHaveBeenCalledOnce();
});

it("pulls pending sandbox changes when the last panel closes", async () => {
  const session = new ProjectTerminalSession("project");
  const releasePanel = session.retainPanel();
  await session.connect();
  mocks.sync.mockClear();
  await session.sendInput("touch note.txt\n");
  mocks.sockets[0].onmessage?.({
    data: JSON.stringify({ type: "data", data: "wrote a file\n" }),
  });
  releasePanel();
  await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
  expect(mocks.sockets[0].close).toHaveBeenCalledOnce();
});
