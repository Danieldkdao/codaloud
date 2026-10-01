import { beforeEach, expect, it, vi } from "vitest";
import { streamEditorExplanation } from "../explanation-actions";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("expo/fetch", () => ({ fetch: mocks.fetch }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getCookie: async () => "session" },
}));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://test" }));

beforeEach(() => mocks.fetch.mockReset());

it("does not cancel the Expo response body after reading its completion event", async () => {
  const chunks = [
    new TextEncoder().encode('{"type":"delta","text":"Done"}\n'),
    new TextEncoder().encode('{"type":"done"}\n'),
  ];
  const cancel = vi.fn(async () => undefined);
  const reader = {
    read: vi.fn(async () => {
      const value = chunks.shift();
      return value ? { done: false, value } : { done: true, value: undefined };
    }),
    cancel,
    releaseLock: vi.fn(),
  };
  mocks.fetch.mockResolvedValue({
    ok: true,
    body: { getReader: () => reader },
  });

  await streamEditorExplanation(
    { path: "a.ts", selected: "x", before: "", after: "" },
    new AbortController().signal,
    vi.fn(),
  );

  expect(cancel).not.toHaveBeenCalled();
  expect(reader.read).toHaveBeenCalledTimes(3);
  expect(reader.releaseLock).toHaveBeenCalledOnce();
});
