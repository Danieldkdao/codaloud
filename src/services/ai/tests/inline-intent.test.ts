import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { classifyInlineIntent } from "../inline-intent";
vi.mock("@/data/env/server", () => ({
  serverEnv: { OPENROUTER_API_KEY: "test-key" },
}));
const request = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", request));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
const answer = (choice: "edit" | "answer" | "ignore") =>
  Response.json({ answers: { intent: { type: "choice", choice } } });

it.each(["edit", "answer", "ignore"] as const)(
  "routes a transcript classified as %s",
  async (choice) => {
    request.mockResolvedValue(answer(choice));
    expect(
      await classifyInlineIntent(
        "Why am I getting this error here?",
        new AbortController().signal,
      ),
    ).toBe(choice);
  },
);

it("sends a single exclusive choice question with the three inline intents", async () => {
  request.mockResolvedValue(answer("answer"));
  await classifyInlineIntent(
    "What is going on here?",
    new AbortController().signal,
  );
  const [url, options] = request.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
  const body = JSON.parse(options.body);
  expect(body).toMatchObject({
    model: "typesafe/jev-1.13",
    state: { transcript: "What is going on here?" },
    questions: { intent: { type: "choice" } },
  });
  expect(Object.keys(body.questions.intent.criteria).sort()).toEqual([
    "answer",
    "edit",
    "ignore",
  ]);
});

it("accepts an answer with a confidence and probabilities", async () => {
  request.mockResolvedValue(
    Response.json({
      answers: {
        intent: {
          type: "choice",
          choice: "edit",
          confidence: 0.93,
          probabilities: { edit: 0.93, answer: 0.06, ignore: 0.01 },
        },
      },
    }),
  );
  expect(
    await classifyInlineIntent(
      "Why am I getting this error here?",
      new AbortController().signal,
    ),
  ).toBe("edit");
});

it("skips empty speech without a request", async () => {
  expect(await classifyInlineIntent("  ", new AbortController().signal)).toBe(
    "ignore",
  );
  expect(request).not.toHaveBeenCalled();
});

it("does not require confidence, which the Decisions API marks optional", async () => {
  request.mockResolvedValue(
    Response.json({ answers: { intent: { type: "choice", choice: "edit" } } }),
  );
  expect(
    await classifyInlineIntent(
      "Why am I getting this error here?",
      new AbortController().signal,
    ),
  ).toBe("edit");
});

it.each([
  Response.json({ answers: {} }),
  Response.json({ answers: { intent: { type: "choice", choice: "rewrite" } } }),
  Response.json({ answers: { intent: { type: "noul", noul: 0.9 } } }),
  Response.json({ answers: { intent: { choice: "edit" } } }),
  new Response("unavailable", { status: 503 }),
])("fails closed on invalid or failed decisions", async (response) => {
  request.mockResolvedValue(response);
  await expect(
    classifyInlineIntent("Add a function", new AbortController().signal),
  ).rejects.toThrow(/Could not check/);
});

it("cancels in-flight classification and ignores a late answer", async () => {
  const controller = new AbortController();
  let resolve!: (response: Response) => void;
  request.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const pending = classifyInlineIntent("Add a function", controller.signal);
  controller.abort();
  expect(request.mock.calls[0][1].signal.aborted).toBe(true);
  resolve(answer("edit"));
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
    classifyInlineIntent("Add a function", new AbortController().signal),
  ).rejects.toThrow(/Could not check/);
  await vi.advanceTimersByTimeAsync(5000);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
