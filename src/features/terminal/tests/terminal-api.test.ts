import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentHash: vi.fn(),
  manifest: vi.fn(),
  upload: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: async () => ({ userId: "user" }),
}));
vi.mock("@/data/env/server", () => ({
  serverEnv: {
    BETTER_AUTH_SECRET: "secret",
    TERMINAL_WS_URL: "wss://example.com/terminal",
  },
}));
vi.mock("../server/sandbox", () => ({
  checkedSandbox: async () => ({ id: "sandbox" }),
  sandboxWorkspaceRoot: async () => "/workspace",
  readSandboxManifest: mocks.manifest,
  readSandboxFileHash: mocks.currentHash,
  uploadSandboxFile: mocks.upload,
  deleteSandboxFile: mocks.delete,
}));

import { handleTerminalRequest } from "../server/terminal-api";

const context = {
  projectId: "00000000-0000-4000-8000-000000000001",
  deviceId: "00000000-0000-4000-8000-000000000002",
  sandboxId: "sandbox",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentHash.mockResolvedValue("a".repeat(64));
});

it("checks only the target file before uploading a changed local copy", async () => {
  const params = new URLSearchParams({
    ...context,
    path: "src/main.py",
    expectedHash: "a".repeat(64),
  });
  const response = await handleTerminalRequest(
    new Request(`https://app.test/api/terminal?${params}`, {
      method: "PUT",
      body: new TextEncoder().encode("print(1)"),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.currentHash).toHaveBeenCalledWith(
    { id: "sandbox" },
    "/workspace",
    "src/main.py",
  );
  expect(mocks.manifest).not.toHaveBeenCalled();
  expect(mocks.upload).toHaveBeenCalledOnce();
});

it("rejects a stale delete without scanning the full workspace", async () => {
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...context,
        action: "delete",
        path: "src/main.py",
        expectedHash: "b".repeat(64),
      }),
    }),
  );
  expect(response.status).toBe(409);
  expect(mocks.manifest).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
});
