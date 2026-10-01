import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), digest: vi.fn() }));

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) => {
    mocks.digest(value);
    return createHash("sha256").update(value).digest("hex");
  },
}));
vi.mock("expo/fetch", () => ({ fetch: mocks.fetch }));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getCookie: async () => "session=test" },
}));
vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => "https://example.test",
}));
vi.mock("@/lib/device-id", () => ({ getDeviceId: async () => "device" }));

import { createRequire } from "node:module";
import { terminalRequestTimeoutMs } from "../constants";
import { encodeSyncDownload } from "../lib/sync-download";
import { terminalApi } from "../actions/terminal-client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  mocks.fetch.mockReset();
  mocks.digest.mockClear();
});

it("sends authenticated sandbox cleanup and requires a durable acknowledgement", async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ accepted: true }),
  });
  await terminalApi.deleteSandbox("project", "device", "sandbox");
  expect(mocks.fetch).toHaveBeenCalledWith(
    "https://example.test/api/terminal",
    expect.objectContaining({
      method: "DELETE",
      headers: { Cookie: "session=test", "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "project",
        deviceId: "device",
        sandboxId: "sandbox",
      }),
    }),
  );
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ accepted: false }),
  });
  await expect(
    terminalApi.deleteSandbox("project", "device", "sandbox"),
  ).rejects.toThrow();
});

it("times out a stalled cleanup handoff after fifteen seconds with the native AbortController", async () => {
  const nativeRequire = createRequire(
    require.resolve("react-native/package.json"),
  );
  vi.stubGlobal(
    "AbortController",
    nativeRequire("abort-controller").AbortController,
  );
  vi.useFakeTimers();
  let signal!: AbortSignal;
  mocks.fetch.mockImplementation((_url, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Aborted")));
    });
  });
  const rejected = expect(
    terminalApi.deleteSandbox("project", "device", "sandbox"),
  ).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15_000);
  await rejected;
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
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

it("preserves the paid-plan requirement from a billing denial", async () => {
  mocks.fetch.mockResolvedValue({
    ok: false,
    status: 402,
    json: async () => ({
      message: "A paid plan is required for the terminal.",
      action: "billing",
      reason: "plan",
    }),
  });

  await expect(
    terminalApi.ensure("project", "device", null),
  ).rejects.toMatchObject({
    name: "TerminalAccessError",
    requirement: "plan",
  });
});

it("shows the HTTP status when the terminal API returns a non-JSON error", async () => {
  mocks.fetch.mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  });
  await expect(terminalApi.ensure("project", "device", null)).rejects.toThrow(
    "Terminal API unavailable (HTTP 404)",
  );
});

it("sends selected large folders with the manifest request", async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ manifest: {} }),
  });
  await terminalApi.manifest("project", "device", "sandbox", ["node_modules"]);
  const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
  expect(JSON.parse(init.body as string)).toMatchObject({
    action: "manifest",
    allowedPaths: ["node_modules"],
  });
});

it("decodes a batch without base64 or per-file HTTP requests", async () => {
  const paths = ["node_modules/a.js", "node_modules/b.js"];
  const files = paths.map((path) => ({
    path,
    bytes: new Uint8Array([0, 255, 10]),
  }));
  const encoded = encodeSyncDownload(files);
  mocks.fetch.mockResolvedValue(new Response(encoded));
  expect(
    await terminalApi.downloadBatch("project", "device", "sandbox", paths),
  ).toEqual(files);
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
    action: "download",
    paths,
  });
});

it("times out a stalled response body using the native AbortController", async () => {
  const nativeRequire = createRequire(
    require.resolve("react-native/package.json"),
  );
  vi.stubGlobal(
    "AbortController",
    nativeRequire("abort-controller").AbortController,
  );
  vi.useFakeTimers();
  let signal!: AbortSignal;
  mocks.fetch.mockImplementation(async (_url, init) => {
    signal = init.signal;
    return {
      ok: true,
      arrayBuffer: () =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("Aborted"))),
        ),
    };
  });
  const downloading = terminalApi.downloadBatch(
    "project",
    "device",
    "sandbox",
    ["a.js"],
  );
  const rejected = expect(downloading).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(terminalRequestTimeoutMs);
  await rejected;
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("reuses the supplied manifest only when the server confirms its exact fingerprint", async () => {
  const manifest = { "a.txt": "a".repeat(64) };
  const hash = createHash("sha256")
    .update(`a.txt\0${manifest["a.txt"]}\0`)
    .digest("hex");
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ unchanged: true, hash }),
  });
  const diagnostics = vi.fn();
  expect(
    await terminalApi.manifest(
      "p",
      "device",
      "sandbox",
      [],
      manifest,
      diagnostics,
    ),
  ).toBe(manifest);
  expect(diagnostics).toHaveBeenCalledWith(
    expect.objectContaining({
      unchanged: true,
      fingerprintMs: expect.any(Number),
      networkMs: expect.any(Number),
    }),
  );
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).knownHash).toBe(hash);
  expect(mocks.digest).toHaveBeenCalledOnce();
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ unchanged: true, hash: "b".repeat(64) }),
  });
  await expect(
    terminalApi.manifest("p", "device", "sandbox", [], manifest),
  ).rejects.toThrow(/fingerprint/i);
});
