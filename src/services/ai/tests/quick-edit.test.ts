import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ stream: vi.fn(), chat: vi.fn((id) => id) }));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  streamText: mocks.stream,
}));
vi.mock("../server", () => ({ openrouter: { chat: mocks.chat } }));
import { streamQuickEdit } from "../quick-edit";
import type { InlineEvent } from "@/features/voice/types";
const source = "const n = Math.floor(Math.random * 10);";
const target = { source, offset: 0, caret: source.length };
const run = async (
  partials: { oldText?: string; newText?: string }[],
  finishReason = "stop",
  final = partials.at(-1),
) => {
  const events: InlineEvent[] = [];
  mocks.stream.mockReturnValue({
    partialOutputStream: (async function* () {
      for (const part of partials) yield part;
    })(),
    output: Promise.resolve(final),
    finishReason: Promise.resolve(finishReason),
  });
  await streamQuickEdit(
    [],
    "fix the missing call",
    "one",
    async (event) => {
      events.push(event);
    },
    new AbortController().signal,
    target,
  );
  return events;
};
it("streams replacement code only after identifying the exact source range", async () => {
  const events = await run([
    { oldText: "Math" },
    { oldText: "Math.random", newText: "Math." },
    { oldText: "Math.random", newText: "Math.random()" },
  ]);
  expect(events[0]).toEqual({ id: "one", type: "start" });
  expect(events[1]).toMatchObject({
    type: "target",
    from: source.indexOf("Math.random"),
    to: source.indexOf("Math.random") + 11,
  });
  expect(
    events
      .filter((event) => event.type === "delta")
      .map((event) => event.text)
      .join(""),
  ).toBe("Math.random()");
  expect(events.at(-1)).toEqual({ id: "one", type: "complete" });
  expect(mocks.stream.mock.lastCall?.[0].output).toBeDefined();
});
it("rejects absent or ambiguous excerpts instead of falling back to insertion", async () => {
  await expect(run([{ oldText: "missing", newText: "fixed" }])).rejects.toThrow(
    /exact|match/i,
  );
  await expect(run([{ oldText: "Math", newText: "fixed" }])).rejects.toThrow(
    /unique|ambiguous/i,
  );
});
it("supports explicit insertion and deletion", async () => {
  expect((await run([{ oldText: "", newText: "\nnext();" }]))[1]).toMatchObject(
    { type: "target", from: source.length, to: source.length },
  );
  expect((await run([{ oldText: " * 10", newText: "" }])).at(-1)?.type).toBe(
    "complete",
  );
});
it("rejects a changed target, non-prefix stream, or truncated output", async () => {
  await expect(
    run([
      { oldText: "Math.random", newText: "Math" },
      { oldText: "Math.floor", newText: "Math.floor()" },
    ]),
  ).rejects.toThrow(/target/i);
  await expect(
    run([
      { oldText: "Math.random", newText: "Math" },
      { oldText: "Math.random", newText: "other" },
    ]),
  ).rejects.toThrow(/stream/i);
  await expect(
    run([{ oldText: "Math.random", newText: "Math.random()" }], "length"),
  ).rejects.toThrow(/incomplete/i);
});
it("stops forwarding code when cancelled", async () => {
  const controller = new AbortController();
  mocks.stream.mockReturnValue({
    partialOutputStream: (async function* () {
      controller.abort();
      yield { oldText: "Math.random", newText: "Math.random()" };
    })(),
  });
  const send = vi.fn(async () => {});
  await expect(
    streamQuickEdit([], "fix", "one", send, controller.signal, target),
  ).rejects.toThrow(/cancel/i);
  expect(send).toHaveBeenCalledTimes(1);
});
it("coalesces tiny replacement chunks while preserving the complete edit", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(100);
  try {
    const events = await run(
      Array.from({ length: 1000 }, (_, index) => ({
        oldText: "Math.random",
        newText: "x".repeat(index + 1),
      })),
    );
    const deltas = events.filter((event) => event.type === "delta");
    expect(deltas.length).toBeLessThan(10);
    expect(deltas.map((event) => event.text).join("")).toBe("x".repeat(1000));
  } finally {
    now.mockRestore();
  }
});
it("handles a CRLF split across partial replacement snapshots", async () => {
  const events = await run([
    { oldText: "Math.random", newText: "first\r" },
    { oldText: "Math.random", newText: "first\r\nsecond" },
  ]);
  expect(
    events
      .filter((event) => event.type === "delta")
      .map((event) => event.text)
      .join(""),
  ).toBe("first\nsecond");
});
