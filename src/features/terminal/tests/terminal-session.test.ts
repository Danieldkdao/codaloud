import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
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
  getTerminalDeviceId: async () => "device",
  terminalApi: {
    ticket: async () => ({
      ticket: "ticket",
      url: "wss://example.test/terminal",
    }),
  },
}));
vi.mock("../actions/sync-workspace", () => ({
  syncProjectWorkspace: mocks.sync,
}));

import { ProjectTerminalSession } from "../actions/terminal-session";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sockets.length = 0;
  mocks.autoReady = true;
  mocks.sync.mockResolvedValue({
    sandboxId: "sandbox",
    conflicts: [],
    failures: [],
    uploaded: 0,
    downloaded: 0,
    deleted: 0,
    localDeleted: 0,
    downloadedPaths: [],
    localDeletedPaths: [],
  });
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
