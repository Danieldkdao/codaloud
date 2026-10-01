import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentHash: vi.fn(),
  manifest: vi.fn(),
  upload: vi.fn(),
  delete: vi.fn(),
  batch: vi.fn(),
  billing: vi.fn(),
  charge: vi.fn(),
  auth: vi.fn(),
  owned: vi.fn(),
  trigger: vi.fn(),
  key: vi.fn(),
}));
vi.mock("@/features/billing/server/billing-service", () => ({
  readBillingStatus: mocks.billing,
  chargeCredits: mocks.charge,
  InsufficientCreditsError: class extends Error {},
}));
vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: mocks.auth,
}));
vi.mock("@/services/trigger/server", () => ({
  tasks: { trigger: mocks.trigger },
  idempotencyKeys: { create: mocks.key },
}));
vi.mock("@/data/env/server", () => ({
  serverEnv: {
    BETTER_AUTH_SECRET: "secret",
    TERMINAL_WS_URL: "wss://example.com/terminal",
  },
}));
vi.mock("../server/sandbox", () => ({
  downloadSandboxFiles: mocks.batch,
  checkedSandbox: async () => ({ id: "sandbox" }),
  sandboxWorkspaceRoot: async () => "/workspace",
  readSandboxManifest: mocks.manifest,
  readSandboxManifestSnapshot: mocks.manifest,
  readSandboxFileHash: mocks.currentHash,
  uploadSandboxFile: mocks.upload,
  deleteSandboxFile: mocks.delete,
  findOwnedSandbox: mocks.owned,
  SandboxOwnershipError: class extends Error {},
}));

import { handleTerminalRequest } from "../server/terminal-api";
import { SandboxOwnershipError } from "../server/sandbox";

const context = {
  projectId: "00000000-0000-4000-8000-000000000001",
  deviceId: "00000000-0000-4000-8000-000000000002",
  sandboxId: "sandbox",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentHash.mockResolvedValue("a".repeat(64));
  mocks.billing.mockResolvedValue({
    tier: "tier_1",
    monthlyCredits: 50,
    purchasedCredits: 0,
  });
  mocks.charge.mockResolvedValue({ monthlyCredits: 48 });
  mocks.auth.mockResolvedValue({ userId: "user" });
  mocks.owned.mockResolvedValue({ id: "sandbox" });
  mocks.trigger.mockResolvedValue({ id: "run_cleanup" });
  mocks.key.mockResolvedValue("cleanup-key");
});

it("queues sandbox cleanup for a Free user without credits or starting the sandbox", async () => {
  mocks.billing.mockResolvedValue({
    tier: "free",
    monthlyCredits: 0,
    purchasedCredits: 0,
  });
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "DELETE",
      body: JSON.stringify(context),
    }),
  );
  expect(response.status).toBe(202);
  expect(mocks.billing).not.toHaveBeenCalled();
  expect(mocks.charge).not.toHaveBeenCalled();
  expect(mocks.owned).toHaveBeenCalledWith("sandbox", {
    userId: "user",
    projectId: context.projectId,
    deviceId: context.deviceId,
  });
  expect(mocks.key).toHaveBeenCalledWith(
    `sandbox-cleanup:user:${context.deviceId}:${context.projectId}:sandbox`,
    { scope: "global" },
  );
  expect(mocks.trigger).toHaveBeenCalledWith(
    "delete-project-sandbox",
    { ...context, userId: "user" },
    expect.objectContaining({ idempotencyKey: "cleanup-key" }),
  );
});

it("does not enqueue sandbox deletion without authentication", async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "DELETE",
      body: JSON.stringify(context),
    }),
  );
  expect(response.status).toBe(401);
  expect(mocks.trigger).not.toHaveBeenCalled();
});

it("acknowledges cleanup that is already complete", async () => {
  mocks.owned.mockResolvedValue(null);
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "DELETE",
      body: JSON.stringify(context),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.trigger).not.toHaveBeenCalled();
});

it("does not let a cleanup request supply another user's identity", async () => {
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "DELETE",
      body: JSON.stringify({ ...context, userId: "other" }),
    }),
  );
  expect(response.status).toBe(400);
  expect(mocks.trigger).not.toHaveBeenCalled();
});

it("leaves cleanup retryable when the background queue is unavailable", async () => {
  mocks.trigger.mockRejectedValueOnce(new Error("Queue unavailable"));
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "DELETE",
      body: JSON.stringify(context),
    }),
  );
  expect(response.status).toBe(500);
});

it("rejects cleanup of another owner's sandbox before enqueueing a task", async () => {
  mocks.owned.mockRejectedValueOnce(
    new SandboxOwnershipError(
      "This sandbox does not belong to this project and device.",
    ),
  );
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "DELETE",
      body: JSON.stringify(context),
    }),
  );
  expect(response.status).toBe(403);
  expect(mocks.trigger).not.toHaveBeenCalled();
});

it("blocks Free users before starting or syncing a paid sandbox", async () => {
  mocks.billing.mockResolvedValue({
    tier: "free",
    monthlyCredits: 50,
    purchasedCredits: 0,
  });
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "POST",
      body: JSON.stringify({ ...context, action: "ensure" }),
    }),
  );
  expect(response.status).toBe(402);
  expect(await response.json()).toMatchObject({
    action: "billing",
    reason: "plan",
  });
  expect(mocks.charge).not.toHaveBeenCalled();
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

it("passes the validated selected paths to sandbox manifest inspection", async () => {
  mocks.manifest.mockResolvedValue({});
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "POST",
      body: JSON.stringify({
        ...context,
        action: "manifest",
        allowedPaths: ["node_modules", "__pycache__"],
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.manifest).toHaveBeenCalledWith(
    { id: "sandbox" },
    "/workspace",
    ["node_modules", "__pycache__"],
    undefined,
  );
});

it("rejects Git metadata selected for file sync", async () => {
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "POST",
      body: JSON.stringify({
        ...context,
        action: "manifest",
        allowedPaths: [".git"],
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(mocks.manifest).not.toHaveBeenCalled();
});

it("downloads a dependency batch with one authenticated request", async () => {
  mocks.batch.mockResolvedValue([
    { path: "node_modules/pkg/index.js", bytes: new Uint8Array([0, 255, 10]) },
  ]);
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "POST",
      body: JSON.stringify({
        ...context,
        action: "download",
        paths: ["node_modules/pkg/index.js"],
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(mocks.batch).toHaveBeenCalledWith({ id: "sandbox" }, "/workspace", [
    "node_modules/pkg/index.js",
  ]);
});

it("passes the known fingerprint to the sandbox and forwards its unchanged confirmation", async () => {
  const hash = "a".repeat(64);
  mocks.manifest.mockResolvedValue({
    unchanged: true,
    hash,
    metrics: { hashed: 0, reused: 1000, bytesHashed: 0, durationMs: 1 },
  });
  const response = await handleTerminalRequest(
    new Request("https://app.test/api/terminal", {
      method: "POST",
      body: JSON.stringify({ ...context, action: "manifest", knownHash: hash }),
    }),
  );
  expect(await response.json()).toMatchObject({ unchanged: true, hash });
  expect(mocks.manifest).toHaveBeenCalledWith(
    { id: "sandbox" },
    "/workspace",
    [],
    hash,
  );
});
