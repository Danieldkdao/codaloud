import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
const mocks = vi.hoisted(() => ({
  model: vi.fn(),
  wait: vi.fn(),
  begin: vi.fn(),
  search: vi.fn(),
  metadata: new Map<string, unknown>(),
}));
vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (options: unknown) => options,
  metadata: {
    set: (key: string, value: unknown) => {
      mocks.metadata.set(key, value);
    },
    del: (key: string) => mocks.metadata.delete(key),
    flush: async () => {},
  },
  wait: {
    createToken: async () => ({ id: "token" }),
    forToken: (...args: unknown[]) =>
      (mocks.metadata.get("command") as { name?: string })?.name === "beginTask"
        ? mocks.begin(...args)
        : mocks.wait(...args),
  },
}));
vi.mock("@/services/ai/server", () => ({ openrouter: { chat: mocks.model } }));
vi.mock("@/services/firecrawl/tools", () => ({
  searchWeb: mocks.search,
  scrapePage: vi.fn(),
}));
import { workspaceTask } from "@/trigger/workspace-task";
const run = (
  workspaceTask as unknown as {
    run: (
      payload: unknown,
      options: { signal: AbortSignal },
    ) => Promise<unknown>;
  }
).run;
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
beforeEach(() => {
  mocks.metadata.clear();
  mocks.wait.mockReset();
  mocks.begin.mockReset().mockResolvedValue({
    ok: true,
    output: { ok: true, text: "Ready", revision: "a".repeat(64) },
  });
});
it("waits for the device's task turn before asking the model to plan", async () => {
  mocks.begin.mockResolvedValue({
    ok: true,
    output: { ok: false, text: "Workspace changed manually." },
  });
  mocks.model.mockClear();
  await expect(
    run(
      { instruction: "Create a file", revision: "a".repeat(64) },
      { signal: new AbortController().signal },
    ),
  ).rejects.toThrow("Workspace changed manually.");
  expect(mocks.model).not.toHaveBeenCalled();
  expect(mocks.metadata.has("command")).toBe(false);
});
it.each([
  { requestedCalls: 24, batched: false },
  { requestedCalls: 25, batched: false },
  { requestedCalls: 25, batched: true },
])(
  "allows 24 calls but never dispatches call 25: $requestedCalls requested, batched=$batched",
  async ({ requestedCalls, batched }) => {
    let steps = 0;
    mocks.wait.mockResolvedValue({
      ok: true,
      output: { ok: true, text: "Workspace status" },
    });
    mocks.model.mockReturnValue(
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              const toolStep = ++steps <= (batched ? 1 : requestedCalls);
              if (toolStep) {
                for (
                  let index = 0;
                  index < (batched ? requestedCalls : 1);
                  index++
                ) {
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId: `status-${steps}-${index}`,
                    toolName: "gitStatus",
                    input: "{}",
                  });
                }
              } else {
                controller.enqueue({ type: "text-start", id: "summary" });
                controller.enqueue({
                  type: "text-delta",
                  id: "summary",
                  delta: "Finished all 24 checks.",
                });
                controller.enqueue({ type: "text-end", id: "summary" });
              }
              controller.enqueue({
                type: "finish",
                finishReason: toolStep
                  ? { unified: "tool-calls", raw: "tool_calls" }
                  : { unified: "stop", raw: "stop" },
                usage,
              });
              controller.close();
            },
          }),
        }),
      }),
    );
    const result = run(
      { instruction: "Inspect workspace status", revision: "a".repeat(64) },
      { signal: new AbortController().signal },
    );
    if (requestedCalls === 24) {
      await expect(result).resolves.toEqual({
        summary: "Finished all 24 checks.",
      });
      expect(steps).toBe(25);
    } else {
      await expect(result).rejects.toMatchObject({
        message:
          "A tool failed (gitStatus). Review completed steps before trying again.",
        cause: { message: "Task tool limit reached." },
      });
    }
    expect(mocks.wait).toHaveBeenCalledTimes(24);
    expect(mocks.metadata.has("command")).toBe(false);
  },
);
it.each([
  {
    toolName: "readFile",
    input: { path: "README.md", startLine: 1, lineCount: 20 },
    path: "README.md",
  },
  { toolName: "listFiles", input: { path: "" }, path: "" },
  { toolName: "listFiles", input: {}, path: "" },
  { toolName: "listFiles", input: { path: "." }, path: "" },
  { toolName: "listFiles", input: { path: "./" }, path: "" },
  { toolName: "listFiles", input: { path: "src" }, path: "src" },
  { toolName: "listFiles", input: { path: ".." }, path: null },
  { toolName: "listFiles", input: { path: "../private" }, path: null },
  { toolName: "listFiles", input: { path: "/" }, path: null },
  { toolName: "listFiles", input: { path: "src/../private" }, path: null },
  { toolName: "listFiles", input: { path: "./src" }, path: null },
  { toolName: "listFiles", input: { path: ".", extra: true }, path: null },
  { toolName: "listFiles", input: { path: 42 }, path: null },
  { toolName: "listFiles", input: null, path: null },
  { toolName: "listFiles", input: "not an object", path: null },
  { toolName: "readFile", input: { path: "." }, path: null },
  {
    toolName: "createFile",
    input: { parentPath: ".", name: "test", kind: "folder" },
    path: null,
  },
])(
  "validates $toolName input $input before dispatching to the device",
  async ({ toolName, input, path }) => {
    mocks.begin.mockResolvedValue({
      ok: true,
      output: {
        ok: true,
        text: "Ready after earlier task",
        revision: "b".repeat(64),
      },
    });
    let count = 0;
    mocks.model.mockReturnValue(
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(c) {
              c.enqueue({ type: "stream-start", warnings: [] });
              if (++count === 1) {
                c.enqueue({
                  type: "tool-call",
                  toolCallId: "read-one",
                  toolName,
                  input: JSON.stringify(input),
                });
                c.enqueue({
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_calls" },
                  usage,
                });
              } else {
                c.enqueue({ type: "text-start", id: "summary" });
                c.enqueue({
                  type: "text-delta",
                  id: "summary",
                  delta: "The README describes your project.",
                });
                c.enqueue({ type: "text-end", id: "summary" });
                c.enqueue({
                  type: "finish",
                  finishReason: { unified: "stop", raw: "stop" },
                  usage,
                });
              }
              c.close();
            },
          }),
        }),
      }),
    );
    mocks.wait.mockImplementation(async () => {
      expect(mocks.metadata.get("command")).toMatchObject({
        id: "read-one",
        name: toolName,
        revision: "b".repeat(64),
        args: { path },
      });
      return {
        ok: true,
        output: {
          ok: true,
          text: "Project documentation",
          revision: "a".repeat(64),
        },
      };
    });
    const result = run(
      { instruction: "Read the readme", revision: "a".repeat(64) },
      { signal: new AbortController().signal },
    );
    if (path === null) {
      await expect(result).rejects.toThrow(`A tool failed (${toolName})`);
      expect(mocks.wait).not.toHaveBeenCalled();
      expect(count).toBe(1);
    } else {
      await expect(result).resolves.toEqual({
        summary: "The README describes your project.",
      });
      expect(mocks.wait).toHaveBeenCalledOnce();
      expect(count).toBe(2);
    }
    expect(mocks.metadata.has("command")).toBe(false);
  },
);
it("fails instead of reporting success when the device wait expires", async () => {
  mocks.model.mockReturnValue(
    new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            c.enqueue({
              type: "tool-call",
              toolCallId: "commit-one",
              toolName: "gitCommit",
              input: JSON.stringify({
                message: "Update docs",
                paths: ["README.md"],
              }),
            });
            c.enqueue({
              type: "finish",
              finishReason: { unified: "tool-calls", raw: "tool_calls" },
              usage,
            });
            c.close();
          },
        }),
      }),
    }),
  );
  mocks.wait.mockResolvedValue({ ok: false, error: "timeout" });
  await expect(
    run(
      { instruction: "Commit docs", revision: "a".repeat(64) },
      { signal: new AbortController().signal },
    ),
  ).rejects.toThrow();
  expect(mocks.metadata.has("command")).toBe(false);
});

it.each([
  "DIRECTORY_NOT_FOUND",
  "FILE_WRITE_FAILED",
  "WORKSPACE_CHANGED",
  "unknown",
  "mutation",
])("handles a folder probe failure safely: %s", async (failureCode) => {
  let step = 0;
  const firstTool = failureCode === "mutation" ? "createFile" : "listFiles";
  const commands: { name: string; args: unknown; revision: string }[] = [];
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          step++;
          if (step === 2) {
            expect(JSON.stringify(prompt)).toContain("DIRECTORY_NOT_FOUND");
            expect(JSON.stringify(prompt)).toContain("folder does not exist");
          }
          if (step <= 3) {
            controller.enqueue({
              type: "tool-call",
              toolCallId: `step-${step}`,
              toolName: step === 1 ? firstTool : "createFile",
              input: JSON.stringify(
                step === 1 && firstTool === "listFiles"
                  ? { path: "tests" }
                  : step === 2
                    ? { parentPath: "", name: "tests", kind: "folder" }
                    : { parentPath: "tests", name: "test2.ts", kind: "file" },
              ),
            });
          } else {
            controller.enqueue({ type: "text-start", id: "summary" });
            controller.enqueue({
              type: "text-delta",
              id: "summary",
              delta: "Created tests/test2.ts.",
            });
            controller.enqueue({ type: "text-end", id: "summary" });
          }
          controller.enqueue({
            type: "finish",
            finishReason: {
              unified: step <= 3 ? "tool-calls" : "stop",
              raw: step <= 3 ? "tool_calls" : "stop",
            },
            usage,
          });
          controller.close();
        },
      }),
    }),
  });
  mocks.model.mockReturnValue(model);
  mocks.wait.mockImplementation(async () => {
    commands.push(mocks.metadata.get("command") as (typeof commands)[number]);
    return {
      ok: true,
      output:
        commands.length === 1
          ? {
              ok: false,
              code:
                failureCode === "mutation"
                  ? "DIRECTORY_NOT_FOUND"
                  : failureCode,
              text: "This folder does not exist. Create its parent folders first.",
            }
          : {
              ok: true,
              text: "Created",
              revision: (commands.length === 2 ? "b" : "c").repeat(64),
            },
    };
  });
  const result = run(
    { instruction: "Create tests/test2.ts", revision: "a".repeat(64) },
    { signal: new AbortController().signal },
  );
  if (failureCode === "DIRECTORY_NOT_FOUND") {
    await expect(result).resolves.toEqual({
      summary: "Created tests/test2.ts.",
    });
    expect(commands.map(({ name, revision }) => ({ name, revision }))).toEqual([
      { name: "listFiles", revision: "a".repeat(64) },
      { name: "createFile", revision: "a".repeat(64) },
      { name: "createFile", revision: "b".repeat(64) },
    ]);
  } else {
    await expect(result).rejects.toThrow(`A tool failed (${firstTool})`);
    expect(commands).toHaveLength(1);
  }
  expect(mocks.metadata.has("command")).toBe(false);
  expect(mocks.metadata.get("logs")).toEqual(
    expect.arrayContaining([expect.stringContaining("folder does not exist")]),
  );
});

it.each([
  "success",
  "mutation",
  "device-failure",
  "timeout",
  "aborted",
  "aborted-during-wait",
  "web-failure",
])(
  "serializes parallel tool calls through %s without abandoning a device wait",
  async (outcome) => {
    let steps = 0;
    let active = 0;
    let maximumActive = 0;
    const abort = new AbortController();
    const acknowledged: string[] = [];
    const revisions: string[] = [];
    const firstTool = outcome === "mutation" ? "createFile" : "listFiles";
    mocks.search.mockRejectedValue(new Error("Diagnostic provider failure"));
    mocks.model.mockReturnValue(
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              if (++steps === 1) {
                for (const name of [
                  firstTool,
                  outcome === "web-failure" ? "searchWeb" : "gitStatus",
                ]) {
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId: name,
                    toolName: name,
                    input: JSON.stringify(
                      name === "createFile"
                        ? { parentPath: "", name: "diagnostic", kind: "folder" }
                        : name === "listFiles"
                          ? { path: "" }
                          : name === "searchWeb"
                            ? { query: "diagnostic fixture" }
                            : {},
                    ),
                  });
                }
                controller.enqueue({
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_calls" },
                  usage,
                });
              } else {
                controller.enqueue({ type: "text-start", id: "summary" });
                controller.enqueue({
                  type: "text-delta",
                  id: "summary",
                  delta: "Inspected the folder and Git status.",
                });
                controller.enqueue({ type: "text-end", id: "summary" });
                controller.enqueue({
                  type: "finish",
                  finishReason: { unified: "stop", raw: "stop" },
                  usage,
                });
              }
              controller.close();
            },
          }),
        }),
      }),
    );
    mocks.wait.mockImplementation(async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      const command = mocks.metadata.get("command") as {
        name: string;
        revision: string;
      };
      revisions.push(command.revision);
      if (outcome === "aborted-during-wait") setTimeout(() => abort.abort(), 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mocks.metadata.get("command")).toBe(command);
      acknowledged.push(command.name);
      active--;
      if (outcome === "aborted") abort.abort();
      if (outcome === "timeout") return { ok: false, error: "timeout" };
      return {
        ok: true,
        output: {
          ok: outcome !== "device-failure",
          text: "Diagnostic fixture",
          revision: (outcome === "mutation" ? "b" : "a").repeat(64),
        },
      };
    });
    const result = run(
      {
        instruction: "Inspect the folder and Git status",
        revision: "a".repeat(64),
      },
      { signal: abort.signal },
    );
    if (outcome === "success" || outcome === "mutation") {
      await expect(result).resolves.toEqual({
        summary: "Inspected the folder and Git status.",
      });
      expect(acknowledged).toEqual([firstTool, "gitStatus"]);
      expect(revisions).toEqual([
        "a".repeat(64),
        (outcome === "mutation" ? "b" : "a").repeat(64),
      ]);
    } else {
      await expect(result).rejects.toThrow();
      expect(acknowledged).toEqual(["listFiles"]);
    }
    expect(maximumActive).toBe(1);
    expect(active).toBe(0);
    expect(mocks.metadata.has("command")).toBe(false);
  },
);
