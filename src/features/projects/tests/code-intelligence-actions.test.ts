import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readProjectCodeIntelligence } from "@/features/projects/actions/code-intelligence-actions";

const network = vi.hoisted(() => vi.fn<typeof fetch>());
vi.mock("@/lib/utils", () => ({
  fetchBase: network,
  isValidIds: (id: string) => id === "project",
  createRequestHeaders: async () => new Headers({ Cookie: "session=test" }),
}));
beforeEach(() => {
  network.mockReset().mockResolvedValue(Response.json({ error: false, data: { diagnostics: [] } }));
  // React Native's AbortSignal polyfill does not expose the static timeout API.
  vi.stubGlobal("AbortSignal", class {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const input = { path: "demo.ts", content: "const value = 1;" };

it("uses a native-compatible timeout and preserves the unsaved buffer", async () => {
  expect(await readProjectCodeIntelligence("project", input)).toEqual({ diagnostics: [] });
  expect(JSON.parse(String(network.mock.calls[0][1]?.body))).toEqual(input);
  expect(new Headers(network.mock.calls[0][1]?.headers).get("Cookie")).toBe("session=test");
});

it("returns null for failed or mismatched analysis instead of a clean result", async () => {
  for (const response of [Response.json({}, { status: 503 }), Response.json({ error: false, data: { completions: [] } }), Response.json({ error: false, data: { diagnostics: [{ severity: "other" }] } })]) {
    network.mockResolvedValueOnce(response);
    expect(await readProjectCodeIntelligence("project", input)).toBeNull();
  }
});

it("aborts a stalled request and releases its timer", async () => {
  vi.useFakeTimers();
  network.mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
  }));
  const result = readProjectCodeIntelligence("project", input);
  await vi.advanceTimersByTimeAsync(70_000);
  expect(await result).toBeNull();
  expect(network.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
