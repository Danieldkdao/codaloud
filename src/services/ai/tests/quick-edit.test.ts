import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ stream: vi.fn(), chat: vi.fn((id) => id) }));
vi.mock("ai", () => ({ streamText: mocks.stream }));
vi.mock("../server", () => ({ openrouter: { chat: mocks.chat } }));
import { streamQuickEdit } from "../quick-edit";

it("sends incremental code before completion and rejects truncated output", async () => {
  const events: unknown[] = [];
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "text-delta", text: "const " };
      expect(events).toContainEqual({
        id: "one",
        type: "delta",
        offset: 0,
        text: "const ",
      });
      yield { type: "text-delta", text: "a = 1;" };
      yield { type: "finish", finishReason: "stop" };
    })(),
  });
  await streamQuickEdit(
    [],
    "add a constant",
    "one",
    async (event) => {
      events.push(event);
    },
    new AbortController().signal,
  );
  expect(events.at(-1)).toEqual({ id: "one", type: "complete" });
  expect(mocks.chat).toHaveBeenCalledWith("openai/gpt-5.4-mini");
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "text-delta", text: "half" };
      yield { type: "finish", finishReason: "length" };
    })(),
  });
  await expect(
    streamQuickEdit(
      [],
      "add",
      "two",
      async () => {},
      new AbortController().signal,
    ),
  ).rejects.toThrow(/incomplete/);
});
it("stops forwarding chunks after cancellation and propagates provider failures", async () => {
  const controller = new AbortController();
  const send = vi.fn(async () => {});
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      controller.abort();
      yield { type: "text-delta", text: "late" };
    })(),
  });
  await expect(
    streamQuickEdit([], "add", "one", send, controller.signal),
  ).rejects.toThrow(/cancel/i);
  expect(send).toHaveBeenCalledTimes(1);
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "error", error: new Error("provider failed") };
    })(),
  });
  await expect(
    streamQuickEdit([], "add", "two", send, new AbortController().signal),
  ).rejects.toThrow("provider failed");
});
it("coalesces a burst of tiny tokens while keeping the first chunk immediate and the final preview exact", async () => {
  vi.spyOn(Date, "now").mockReturnValue(100);
  mocks.stream.mockReturnValue({
    stream: (async function* () {
      for (let i = 0; i < 2000; i++) yield { type: "text-delta", text: "x" };
      yield { type: "finish", finishReason: "stop" };
    })(),
  });
  const events: { type: string; text?: string }[] = [];
  await streamQuickEdit(
    [],
    "insert",
    "burst",
    async (event) => {
      events.push(event);
    },
    new AbortController().signal,
  );
  const chunks = events.filter((event) => event.type === "delta");
  expect(chunks.length).toBeLessThan(10);
  expect(chunks[0].text).toBe("x");
  expect(chunks.map((event) => event.text).join("")).toBe("x".repeat(2000));
  expect(events.at(-1)?.type).toBe("complete");
});
