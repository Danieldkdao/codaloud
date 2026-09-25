import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { classifyInlineEditIntent } from "../inline-edit-intent";
vi.mock("@/data/env/server", () => ({
  serverEnv: { OPENROUTER_API_KEY: "test-key" },
}));
const request = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", request));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
const answer = (noul: number) =>
  Response.json({ answers: { edit: { type: "noul", noul } } });
it.each([
  [0.01, false],
  [0.5, false],
  [0.69, false],
  [0.7, true],
  [1, true],
])("gates an edit at probability %s", async (probability, expected) => {
  request.mockResolvedValue(answer(probability as number));
  expect(
    await classifyInlineEditIntent(
      "Fix the random call",
      new AbortController().signal,
    ),
  ).toBe(expected);
  const [url, options] = request.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
  expect(JSON.parse(options.body)).toMatchObject({
    model: "typesafe/jev-1.13",
    state: { transcript: "Fix the random call" },
    questions: { edit: { type: "noul" } },
  });
});
it("skips empty speech without a request", async () => {
  expect(
    await classifyInlineEditIntent("  ", new AbortController().signal),
  ).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
it.each([
  Response.json({ answers: {} }),
  Response.json({ answers: { edit: { type: "noul", noul: 2 } } }),
  new Response("unavailable", { status: 503 }),
])("fails closed on invalid or failed decisions", async (response) => {
  request.mockResolvedValue(response);
  await expect(
    classifyInlineEditIntent("Add a function", new AbortController().signal),
  ).rejects.toThrow(/Could not check/);
});
it("cancels in-flight classification and ignores a late affirmative answer", async () => {
  const controller = new AbortController();
  let resolve!: (response: Response) => void;
  request.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const pending = classifyInlineEditIntent("Add a function", controller.signal);
  controller.abort();
  expect(request.mock.calls[0][1].signal.aborted).toBe(true);
  resolve(answer(1));
  await expect(pending).rejects.toThrow(/cancelled/i);
});
it("bounds a stalled decision request", async () => {
  vi.useFakeTimers();
  request.mockImplementation(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
  );
  const pending = expect(
    classifyInlineEditIntent("Add a function", new AbortController().signal),
  ).rejects.toThrow(/Could not check/);
  await vi.advanceTimersByTimeAsync(5000);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
