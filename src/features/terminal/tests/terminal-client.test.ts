import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("expo/fetch", () => ({ fetch: mocks.fetch }));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getCookie: async () => "session=test" },
}));
vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => "https://example.test",
}));
vi.mock("@/lib/device-id", () => ({ getDeviceId: async () => "device" }));

import { terminalApi } from "../actions/terminal-client";

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.fetch.mockReset();
});

it("uploads binary bytes without constructing a React Native Blob", async () => {
  const source = new Uint8Array([9, 0, 255, 10, 8]);
  const bytes = source.subarray(1, 4);
  vi.stubGlobal(
    "Blob",
    class {
      constructor() {
        throw new Error(
          "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported",
        );
      }
    },
  );
  mocks.fetch.mockResolvedValue({ ok: true });

  await terminalApi.upload(
    "project",
    "device",
    "sandbox",
    "src/main.ts",
    bytes,
    undefined,
  );

  expect(mocks.fetch).toHaveBeenCalledOnce();
  const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toContain("path=src%2Fmain.ts");
  expect(init.method).toBe("PUT");
  expect(init.headers).toEqual({
    Cookie: "session=test",
    "Content-Type": "application/octet-stream",
  });
  expect(ArrayBuffer.isView(init.body)).toBe(true);
  expect(Array.from(init.body as Uint8Array)).toEqual([0, 255, 10]);
});
