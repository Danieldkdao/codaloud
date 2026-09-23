// @vitest-environment happy-dom
import { createRequire } from "node:module";
import { act, createElement, memo, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentTaskRecord } from "../types";
import type {
  AgentCommandSchema,
  AgentTaskRequestSchema,
  AgentToolResultSchema,
} from "../schemas";
const mocks = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  create: vi.fn(),
  execute: vi.fn(),
  mutation: vi.fn(),
  complete: vi.fn(),
  subscribe: vi.fn(),
  revision: "a".repeat(64),
  uuid: 0,
}));
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItem: async (key: string) => mocks.disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mocks.disk.set(key, value);
    },
  },
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () =>
    `00000000-0000-4000-8000-${String(++mocks.uuid).padStart(12, "0")}`,
}));
vi.mock("../actions", () => ({
  createAgentTask: mocks.create,
  completeAgentCommand: mocks.complete,
  subscribeAgentTask: mocks.subscribe,
}));
vi.mock("../tools/device-tools", () => ({
  executeDeviceTool: mocks.execute,
  readWorkspaceRevision: async () => mocks.revision,
}));
vi.mock("../workspace-access", () => ({
  flushAgentWorkspace: async () => {},
  runAgentMutation: mocks.mutation,
}));
const projectId = "00000000-0000-4000-8000-000000000099";
const nativeRequire = createRequire(
  import.meta.resolve("react-native/package.json"),
);
const nativeAbort = nativeRequire("abort-controller") as {
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
};
let runtime: typeof import("../task-runtime").agentTasks;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  mocks.disk.clear();
  mocks.revision = "a".repeat(64);
  mocks.create.mockReset().mockResolvedValue({ id: "run_test" });
  mocks.complete.mockReset().mockResolvedValue(undefined);
  mocks.execute.mockReset().mockResolvedValue({ ok: true, text: "done" });
  mocks.mutation
    .mockReset()
    .mockImplementation(
      async (_projectId: string, action: () => Promise<unknown>) => action(),
    );
  mocks.subscribe.mockReset().mockImplementation(async function* () {});
  runtime = (await import("../task-runtime")).agentTasks;
  runtime.setSession("user-a", true);
});
it("does not show a reconnect warning for repeated snapshots of an acknowledged command", async () => {
  const event = {
    id: "run_test",
    status: "waiting",
    logs: ["Running: Check Git status"],
    command: {
      id: "status-one",
      name: "gitStatus",
      args: {},
      revision: "a".repeat(64),
      tokenId: "token-one",
    },
  };
  mocks.subscribe.mockImplementation(async function* () {
    yield event;
    yield { ...event, logs: [...event.logs, "Completed Check Git status"] };
    yield { ...event, status: "completed", command: null, summary: "Done" };
  });
  mocks.complete
    .mockResolvedValueOnce(undefined)
    .mockRejectedValue(
      new Error("Couldn’t connect to the task service. Reconnecting…"),
    );
  await runtime.enqueue(projectId, "Check status", "call-one");
  await vi.advanceTimersByTimeAsync(1);
  expect(runtime.getSnapshot()[0].connectionError).toBeUndefined();
  expect(runtime.getSnapshot()[0].event.status).toBe("completed");
  expect(mocks.complete).toHaveBeenCalledOnce();
  expect(mocks.execute).toHaveBeenCalledOnce();
});
afterEach(() => {
  runtime.setSession(null, false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each([false, true])(
  "acknowledges startup with React Native cancellation APIs, native static signal=%s",
  async (nativeSignal) => {
    vi.stubGlobal("AbortController", nativeAbort.AbortController);
    if (nativeSignal) vi.stubGlobal("AbortSignal", nativeAbort.AbortSignal);
    mocks.subscribe.mockImplementation(async function* () {
      yield {
        id: "run_test",
        status: "queued",
        logs: ["Waiting for workspace"],
        command: {
          id: "begin",
          name: "beginTask",
          args: {},
          revision: mocks.revision,
          tokenId: "begin-token",
        },
      };
      // The worker cannot continue until its startup waitpoint is acknowledged.
      if (mocks.complete.mock.calls.length)
        yield {
          id: "run_test",
          status: "completed",
          logs: ["Finished"],
          command: null,
        };
    });
    await expect(
      runtime.enqueue(projectId, "Create a file", "native-start"),
    ).resolves.toMatchObject({ accepted: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.getSnapshot()[0].connectionError).toBeUndefined();
    expect(mocks.complete).toHaveBeenCalledWith(
      "run_test",
      "begin-token",
      expect.objectContaining({ ok: true, revision: mocks.revision }),
      expect.anything(),
    );
    expect(runtime.getSnapshot()[0].event.status).toBe("completed");
  },
);

it.each(["running", "completed", "failed"] as const)(
  "keeps the first %s task visible when a second request arrives",
  async (status) => {
    let sequence = 0;
    mocks.create.mockImplementation(async () => ({ id: `run_${++sequence}` }));
    mocks.subscribe.mockImplementation(async function* (id) {
      yield {
        id,
        status: id === "run_1" ? status : "queued",
        logs: [],
        command: null,
      };
    });
    await runtime.enqueue(
      projectId,
      "Create first file",
      "first-visible",
      "First file",
    );
    await vi.advanceTimersByTimeAsync(1);
    await runtime.enqueue(
      projectId,
      "Create second file",
      "second-visible",
      "Second file",
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.getSnapshot().map((task) => task.request.title)).toEqual([
      "First file",
      "Second file",
    ]);
    expect(runtime.getSnapshot().map((task) => task.event.id)).toEqual([
      "run_1",
      "run_2",
    ]);
  },
);
it("reports a native startup conflict to the worker instead of abandoning its waitpoint", async () => {
  vi.stubGlobal("AbortController", nativeAbort.AbortController);
  vi.stubGlobal("AbortSignal", nativeAbort.AbortSignal);
  mocks.subscribe.mockImplementation(async function* () {
    mocks.revision = "d".repeat(64);
    yield {
      id: "run_test",
      status: "queued",
      logs: [],
      command: {
        id: "begin",
        name: "beginTask",
        args: {},
        revision: "a".repeat(64),
        tokenId: "begin-token",
      },
    };
  });
  await runtime.enqueue(projectId, "Create a file", "native-conflict");
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.complete).toHaveBeenCalledWith(
    "run_test",
    "begin-token",
    expect.objectContaining({
      ok: false,
      text: expect.stringContaining("workspace changed"),
    }),
    expect.anything(),
  );
  expect(runtime.getSnapshot()[0].connectionError).toBeUndefined();
});

it("times out an uncertain native submission and resumes with the same request ID", async () => {
  vi.stubGlobal("AbortController", nativeAbort.AbortController);
  vi.stubGlobal("AbortSignal", nativeAbort.AbortSignal);
  let requestSignal: AbortSignal | undefined;
  mocks.create.mockImplementationOnce((_request, signal: AbortSignal) => {
    requestSignal = signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener(
        "abort",
        () => reject(new Error("Submission timed out.")),
        { once: true },
      ),
    );
  });
  const submission = runtime
    .enqueue(projectId, "Create file", "timeout")
    .catch((error: Error) => error);
  await vi.advanceTimersByTimeAsync(11999);
  expect(requestSignal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(requestSignal?.aborted).toBe(true);
  expect(await submission).toMatchObject({ message: "Submission timed out." });
  expect(mocks.create.mock.calls[1][0].requestId).toBe(
    mocks.create.mock.calls[0][0].requestId,
  );
  expect(runtime.getSnapshot()).toHaveLength(1);
});

it("bounds retained history at 50 without evicting an older active task", async () => {
  let sequence = 0;
  mocks.create.mockImplementation(async () => ({ id: `run_${++sequence}` }));
  mocks.subscribe.mockImplementation(async function* (id) {
    yield {
      id,
      status: id === "run_1" ? "running" : "completed",
      logs: [],
      command: null,
    };
  });
  for (let index = 0; index < 51; index++) {
    await runtime.enqueue(projectId, `Request ${index}`, `history-${index}`);
    await vi.advanceTimersByTimeAsync(1);
  }
  const tasks = runtime.getSnapshot();
  expect(tasks).toHaveLength(50);
  expect(tasks[0].event.id).toBe("run_1");
  expect(tasks.some((task) => task.event.id === "run_2")).toBe(false);
  expect(tasks.at(-1)?.event.id).toBe("run_51");
  expect(
    JSON.parse(mocks.disk.get("codaloud.agent.tasks.user-a")!),
  ).toHaveLength(50);
});
it("deduplicates concurrent deliveries of the same voice tool call", async () => {
  await Promise.all([
    runtime.enqueue(projectId, "Read files", "call-one"),
    runtime.enqueue(projectId, "Read files", "call-one"),
  ]);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(runtime.getSnapshot()).toHaveLength(1);
});
it("persists the task title and sends it with the accepted request", async () => {
  await runtime.enqueue(
    projectId,
    "Read every project file",
    "title-call",
    "Explore project",
  );
  expect(runtime.getSnapshot()[0].request.title).toBe("Explore project");
  expect(mocks.create.mock.calls[0][0].title).toBe("Explore project");
});
it("publishes new task identities for live activity without mutating previously rendered snapshots", async () => {
  let advance: (() => void) | undefined;
  const nextEvent = new Promise<void>((resolve) => {
    advance = resolve;
  });
  mocks.subscribe.mockImplementation(async function* () {
    yield {
      id: "run_test",
      status: "running",
      logs: ["Running: Read file"],
      command: null,
    };
    await nextEvent;
    yield {
      id: "run_test",
      status: "completed",
      logs: ["Completed Read file"],
      command: null,
    };
  });
  await runtime.enqueue(projectId, "Read a file", "live-call");
  await vi.advanceTimersByTimeAsync(1);
  const rendered = runtime.getSnapshot();
  const renderedTask = rendered[0];
  expect(renderedTask.event.status).toBe("running");
  advance!();
  await vi.advanceTimersByTimeAsync(1);
  const latest = runtime.getSnapshot();
  expect(latest[0].event.logs).toEqual(["Completed Read file"]);
  // Compiler-memoized task cards/sheets compare this prop by identity.
  expect(latest[0]).not.toBe(renderedTask);
  expect(renderedTask.event.logs).toEqual(["Running: Read file"]);
  expect(runtime.getSnapshot()).toBe(latest);
});
it("updates an already-mounted memoized activity view without closing and reopening it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let advance: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    advance = resolve;
  });
  mocks.subscribe.mockImplementation(async function* () {
    yield {
      id: "run_test",
      status: "running",
      logs: ["Running: Create file"],
      command: null,
    };
    await next;
    yield {
      id: "run_test",
      status: "completed",
      logs: ["Completed Create file"],
      command: null,
    };
  });
  await runtime.enqueue(projectId, "Create a file", "live-view");
  await vi.advanceTimersByTimeAsync(1);
  // Reproduce the compiler's task-prop memoization at the actual store boundary.
  const Activity = memo(({ task }: { task: AgentTaskRecord }) =>
    createElement("p", null, task.event.logs.join("\n")),
  );
  const Screen = () => {
    const tasks = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
    return createElement(Activity, { task: tasks[0] });
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() => root.render(createElement(Screen)));
    expect(container.textContent).toBe("Running: Create file");
    await act(async () => {
      advance();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(container.textContent).toBe("Completed Create file");
  } finally {
    act(() => root.unmount());
  }
});
it("does not reconnect an old user's task after changing accounts", async () => {
  await runtime.enqueue(projectId, "Read private files", "call-one");
  await vi.advanceTimersByTimeAsync(1);
  runtime.setSession("user-b", true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(runtime.getSnapshot()).toHaveLength(0);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("never reports an unconfirmed POST as accepted on redelivery", async () => {
  mocks.create.mockRejectedValue(new Error("offline"));
  await expect(
    runtime.enqueue(projectId, "Commit", "call-one"),
  ).rejects.toThrow();
  expect(await runtime.enqueue(projectId, "Commit", "call-one")).toMatchObject({
    accepted: false,
  });
});
it.each([
  { overlap: false, manualEdit: "none" },
  { overlap: true, manualEdit: "none" },
  { overlap: true, manualEdit: "before-start" },
  { overlap: true, manualEdit: "after-start" },
])(
  "handles queued file creation with overlap=$overlap and manual edit=$manualEdit",
  async ({ overlap, manualEdit }) => {
    let release: () => void = () => {};
    const start = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finishFirst: () => void = () => {};
    const firstFinished = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const requests: Record<string, AgentTaskRequestSchema> = {};
    const outputs: Record<string, AgentToolResultSchema> = {};
    const files: string[] = [];
    mocks.create.mockImplementation(async (request) => {
      const id = `run_${Object.keys(requests).length + 1}`;
      requests[id] = request;
      return { id };
    });
    mocks.execute.mockImplementation(
      async (_project: string, command: AgentCommandSchema) => {
        if (command.revision !== mocks.revision)
          throw new Error(
            "The workspace changed after this task started. Please try again.",
          );
        files.push(String(command.args.name));
        mocks.revision = (files.length === 1 ? "b" : "c").repeat(64);
        return { ok: true, text: "Created", revision: mocks.revision };
      },
    );
    mocks.complete.mockImplementation(async (id, _token, output) => {
      outputs[id] = output;
    });
    mocks.subscribe.mockImplementation(async function* (id) {
      await start;
      if (id === "run_2" && !overlap) await firstFinished;
      yield {
        id,
        status: "queued",
        logs: ["Waiting for workspace"],
        command: {
          id: "begin",
          tokenId: `begin_${id}`,
          name: "beginTask",
          args: {},
          revision: requests[id].revision,
        },
      };
      if (!outputs[id]?.ok) {
        yield {
          id,
          status: "failed",
          logs: [outputs[id]?.text],
          command: null,
        };
        return;
      }
      const revision = outputs[id]?.revision ?? requests[id].revision;
      if (id === "run_2" && manualEdit === "after-start")
        mocks.revision = "d".repeat(64);
      yield {
        id,
        status: "waiting",
        logs: ["Running: Create file"],
        command: {
          id: "create",
          tokenId: `token_${id}`,
          name: "createFile",
          args: { parentPath: "", name: `${id}.ts`, kind: "file" },
          revision,
        },
      };
      if (id === "run_1" && manualEdit === "before-start")
        mocks.revision = "d".repeat(64);
      yield {
        id,
        status: outputs[id]?.ok ? "completed" : "failed",
        logs: [outputs[id]?.text],
        command: null,
      };
      if (id === "run_1") finishFirst();
    });
    await runtime.enqueue(projectId, "Create first file", "first");
    await runtime.enqueue(projectId, "Create second file", "second");
    release();
    await vi.advanceTimersByTimeAsync(1);
    if (manualEdit === "none") {
      expect(
        outputs.run_2,
        "second file must not reject the first task's own revision change",
      ).toMatchObject({ ok: true });
      expect(files).toEqual(["run_1.ts", "run_2.ts"]);
      const saved = JSON.parse(mocks.disk.get("codaloud.agent.tasks.user-a")!);
      expect(saved[1].execution).toEqual({
        started: true,
        revision: "b".repeat(64),
      });
    } else {
      expect(outputs.run_2).toMatchObject({
        ok: false,
        text: expect.stringContaining("workspace changed"),
      });
      expect(files).toEqual(["run_1.ts"]);
    }
    expect(requests.run_2.revision).toBe("a".repeat(64));
  },
);

it("does not let a blocked project stop an independent project's task", async () => {
  let run = 0;
  mocks.create.mockImplementation(async () => ({ id: `run_${++run}` }));
  mocks.subscribe.mockImplementation(async function* (id) {
    yield {
      id,
      status: "queued",
      logs: [],
      command: {
        id: "begin",
        tokenId: `begin_${id}`,
        name: "beginTask",
        args: {},
        revision: mocks.revision,
      },
    };
    // Keep the first task running, so the next task in its project must wait.
    await new Promise(() => {});
  });
  await runtime.enqueue(projectId, "First", "first");
  await runtime.enqueue(projectId, "Second", "second");
  await runtime.enqueue(
    "00000000-0000-4000-8000-000000000088",
    "Other project",
    "third",
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.complete.mock.calls.map(([id]) => id)).toEqual([
    "run_1",
    "run_3",
  ]);
  runtime.setSession("user-b", true);
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.complete.mock.calls.map(([id]) => id)).toEqual([
    "run_1",
    "run_3",
  ]);
  expect(runtime.getSnapshot()).toEqual([]);
});

it("replays a persisted starting revision after reconnect without rebasing an active task", async () => {
  mocks.complete.mockRejectedValueOnce(new Error("lost acknowledgement"));
  mocks.subscribe.mockImplementation(async function* () {
    yield {
      id: "run_test",
      status: "queued",
      logs: [],
      command: {
        id: "begin",
        tokenId: "begin",
        name: "beginTask",
        args: {},
        revision: "a".repeat(64),
      },
    };
  });
  await runtime.enqueue(projectId, "Read then edit", "start");
  await vi.advanceTimersByTimeAsync(1);
  runtime.setSession(null, false);
  mocks.revision = "d".repeat(64);
  runtime.setSession("user-a", true);
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.complete).toHaveBeenCalledTimes(2);
  expect(mocks.complete.mock.calls[1][2]).toMatchObject({
    ok: true,
    revision: "a".repeat(64),
  });
  // A subsequent write still carries A and will fail the native guard against D.
  expect(runtime.getSnapshot()[0].execution?.revision).toBe("a".repeat(64));
});
it("does not execute a mutation if the account changes while the workspace lock is being acquired", async () => {
  mocks.mutation.mockImplementation(
    async (_projectId: string, action: () => Promise<unknown>) => {
      runtime.setSession("user-b", true);
      return action();
    },
  );
  mocks.subscribe.mockImplementation(async function* () {
    yield {
      id: "run_test",
      status: "waiting",
      logs: [],
      command: {
        id: "create",
        tokenId: "create",
        name: "createFile",
        args: { name: "file.ts", kind: "file", parentPath: "" },
        revision: "a".repeat(64),
      },
    };
  });
  await runtime.enqueue(projectId, "Create file", "switch-user");
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.execute).not.toHaveBeenCalled();
});
