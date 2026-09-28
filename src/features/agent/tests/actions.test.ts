import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("expo/fetch", () => ({ fetch: mocks.fetch }));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getCookie: async () => "test-session" },
}));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://test" }));
import { completeAgentCommand, subscribeAgentTask } from "../actions";

beforeEach(() => mocks.fetch.mockReset());
it("treats an obsolete acknowledgement as settled, not a connection outage", async () => {
  mocks.fetch.mockResolvedValue(new Response(null, { status: 409 }));
  await expect(
    completeAgentCommand(
      "run_one",
      "old-token",
      { ok: true, text: "done", truncated: false },
      new AbortController().signal,
    ),
  ).resolves.toBeUndefined();
});
it.each([401, 403, 503])(
  "still reports HTTP %s acknowledgement failures",
  async (status) => {
    mocks.fetch.mockResolvedValue(new Response(null, { status }));
    await expect(
      completeAgentCommand(
        "run_one",
        "token",
        { ok: true, text: "done", truncated: false },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  },
);
it("does not ignore a conflict when opening a task stream", async () => {
  mocks.fetch.mockResolvedValue(new Response(null, { status: 409 }));
  await expect(
    subscribeAgentTask("run_one", new AbortController().signal).next(),
  ).rejects.toThrow();
});
