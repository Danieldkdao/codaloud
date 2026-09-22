import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
const mocks = vi.hoisted(() => ({
  model: vi.fn(),
  wait: vi.fn(),
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
  wait: { createToken: async () => ({ id: "token" }), forToken: mocks.wait },
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
});
it("runs the real AI SDK tool loop through a validated device acknowledgement", async () => {
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
                toolName: "readFile",
                input: JSON.stringify({
                  path: "README.md",
                  startLine: 1,
                  lineCount: 20,
                }),
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
      name: "readFile",
      revision: "a".repeat(64),
      args: { path: "README.md" },
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
  expect(
    await run(
      { instruction: "Read the readme", revision: "a".repeat(64) },
      { signal: new AbortController().signal },
    ),
  ).toEqual({ summary: "The README describes your project." });
  expect(mocks.metadata.has("command")).toBe(false);
  expect(mocks.wait).toHaveBeenCalledOnce();
});
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
