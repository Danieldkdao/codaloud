import { beforeEach, describe, expect, it, vi } from "vitest";

import { APIError } from "better-auth/api";
import { POST } from "@/app/api/projects+api";
import { ProjectTable, type ProjectInsertData } from "@/db/schemas/project";
import { ProjectOperationTable } from "@/db/schemas/project-operation";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listUserAccounts: vi.fn(),
  getAccessToken: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  transaction: vi.fn(),
  commit: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  updateReturning: vi.fn(),
  claim: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { listUserAccounts: mocks.listUserAccounts, getAccessToken: mocks.getAccessToken } },
}));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => undefined }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@/db/db", () => ({ db: { transaction: mocks.transaction, update: mocks.update } }));
vi.mock("@/data/env/server", () => ({ serverEnv: { TRIGGER_SECRET_KEY: "test-trigger-secret" } }));
vi.mock("@/features/projects/server/project-operations", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/projects/server/project-operations")>(),
  // Atomic claiming is exercised against PostgreSQL in sandbox-dispatch-recovery.test.ts.
  claimProjectSandboxDispatchDb: mocks.claim,
}));

const request = (payload: unknown, contentType = "application/json") => new Request(
  "https://codaloud.test/api/projects",
  {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(payload),
  },
);

const network = vi.fn<typeof fetch>();

beforeEach(() => {
  mocks.claim.mockReset().mockResolvedValue({
    id: "created-operation", projectId: "created-project", userId: "current-user", dispatchAttempts: 1,
  });
  mocks.transaction.mockImplementation(async (callback) => {
    const result = await callback({ insert: mocks.insert });
    mocks.commit();
    return result;
  });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.updateReturning });
  mocks.updateReturning.mockReset().mockResolvedValue([{ id: "created-operation" }]);
  mocks.insert.mockReset();
  mocks.returning.mockReset();
  mocks.listUserAccounts.mockResolvedValue([{ id: "linked-account", providerId: "github", scopes: ["repo"] }]);
  mocks.getAccessToken.mockResolvedValue({ accessToken: "test-token" });
  network.mockReset();
  network.mockImplementation(async (url) => String(url).startsWith("https://api.trigger.dev/")
    ? Response.json({ id: "run_sandbox" })
    : String(url).includes("/branches/")
    ? Response.json({ name: "develop", commit: { sha: "abc123" } })
    : Response.json({
        id: 123456789,
        name: "selected-repository",
        full_name: "owner/selected-repository",
        description: null,
        private: true,
        archived: false,
        default_branch: "develop",
        clone_url: "https://github.com/owner/selected-repository.git",
        html_url: "https://github.com/owner/selected-repository",
        permissions: { pull: true },
      }));
  vi.stubGlobal("fetch", network);
  mocks.getCurrentUser.mockResolvedValue({ userId: "current-user" });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockImplementation((data: ProjectInsertData) => {
    mocks.returning.mockResolvedValue([{ id: "kind" in data ? "created-operation" : "created-project", ...data }]);
    return { returning: mocks.returning };
  });
});

describe("project creation route and insert flow", () => {
  it.each([
    { source: "new", repositoryId: undefined, githubRepositoryId: null },
    { source: "github", repositoryId: "123456789", githubRepositoryId: "123456789" },
  ])("inserts a $source project and saves its import branch on the operation", async ({ source, repositoryId, githubRepositoryId }) => {
    const response = await POST(request({ name: " My project ", source, repositoryId }));

    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenNthCalledWith(1, ProjectTable);
    expect(mocks.insert).toHaveBeenNthCalledWith(2, ProjectOperationTable);
    expect(mocks.values).toHaveBeenCalledTimes(2);
    expect(mocks.values).toHaveBeenNthCalledWith(1, {
      name: "My project", userId: "current-user", githubRepositoryId,
    });
    expect(mocks.values).toHaveBeenNthCalledWith(2, {
      projectId: "created-project",
      userId: "current-user",
      kind: "prepare",
      githubAccountId: source === "github" ? "linked-account" : null,
      githubBranchName: source === "github" ? "develop" : null,
    });
    expect(await response.json()).toEqual({
      error: false,
      message: "Project created successfully.",
      data: { id: "created-project", name: "My project", userId: "current-user", githubRepositoryId },
    });
  });

  it.each([undefined, null, "", " ", "abc", "0", "-1", "1.5", 123])(
    "rejects a GitHub import with invalid repository ID %s before inserting",
    async (repositoryId) => {
      const response = await POST(request({ name: "My project", source: "github", repositoryId }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: true, message: "Select a GitHub repository." });
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );

  it.each([null, "", "   ", "feature/import"])("rejects a client-supplied branch %s before inserting", async (branchName) => {
    const response = await POST(request({ name: "Import", source: "github", repositoryId: "123", branchName }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([undefined, "unknown"])("rejects missing or unsupported source %s", async (source) => {
    const response = await POST(request({ name: "My project", source }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: true, message: "Choose how to start your project." });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    { source: "new", repositoryId: "123" },
    { source: "new", branchName: "main" },
    { source: "new", userId: "another-user" },
    { source: "github", repositoryId: "123", githubRepositoryId: "456" },
    { source: "github", repositoryId: "123", accountId: "another-account" },
    { source: "github", repositoryId: "123", cloneUrl: "https://example.com/repository.git" },
    { source: "github", repositoryId: "123", accessToken: "client-token" },
  ])("rejects unexpected fields before inserting: %o", async (fields) => {
    const response = await POST(request({ name: "My project", ...fields }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("requires authentication before inserting", async () => {
    mocks.getCurrentUser.mockResolvedValue({ userId: null });
    const response = await POST(request({ name: "My project", source: "new" }));
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("requires JSON before inserting", async () => {
    const response = await POST(request({ name: "My project", source: "new" }, "text/plain"));
    expect(response.status).toBe(415);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([1, 2])("rejects the transaction when insert %s fails", async (failedInsert) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    if (failedInsert === 2) {
      mocks.insert.mockImplementationOnce(() => ({ values: mocks.values }));
    }
    const error = new Error("Database insert failed");
    mocks.insert.mockImplementationOnce(() => { throw error; });

    const response = await POST(request({ name: "My project", source: "new" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: true,
      message: "Unable to create project. Please try again.",
    });
    expect(mocks.insert).toHaveBeenCalledTimes(failedInsert);
    expect(network).not.toHaveBeenCalled();
    await expect(mocks.transaction.mock.results[0].value).rejects.toBe(error);
  });
});


describe("GitHub import access validation", () => {
  const importRequest = () => request({ name: "Import", source: "github", repositoryId: "123456789" });

  it.each([
    { accounts: [] },
    { accounts: [{ id: "github-account", providerId: "github", scopes: ["read:user"] }] },
    { accounts: [{ id: "google-account", providerId: "google", scopes: ["repo"] }] },
  ])("rejects imports without a linked GitHub repository grant: $accounts", async ({ accounts }) => {
    mocks.listUserAccounts.mockResolvedValue(accounts);
    const response = await POST(importRequest());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: true, code: "GITHUB_RECONNECT_REQUIRED" });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("checks the selected repository using credentials from the current session before inserting", async () => {
    const req = importRequest();
    expect((await POST(req)).status).toBe(201);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({ body: { accountId: "linked-account" }, headers: req.headers });
    const [url, options] = network.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repositories/123456789");
    expect(new Headers(options?.headers).get("authorization")).toBe("token test-token");
    expect(options?.signal).toBe(req.signal);
    expect(network.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
  });

  it("verifies the repository default branch with the authorized repository before starting the transaction", async () => {
    const req = importRequest();
    expect((await POST(req)).status).toBe(201);
    const [url, options] = network.mock.calls[1];
    expect(String(url)).toBe("https://api.github.com/repos/owner/selected-repository/branches/develop");
    expect(new Headers(options?.headers).get("authorization")).toBe("token test-token");
    expect(options?.signal).toBe(req.signal);
    expect(network.mock.invocationCallOrder[1]).toBeLessThan(mocks.transaction.mock.invocationCallOrder[0]);
  });

  it.each([
    { scenario: "missing", upstream: 404, expected: 403 },
    { scenario: "renamed", upstream: 200, expected: 403 },
    { scenario: "rate-limited", upstream: 429, expected: 429 },
    { scenario: "unavailable", upstream: 500, expected: 502 },
  ])("rejects a $scenario branch before creating or dispatching a project", async ({ scenario, upstream, expected }) => {
    const defaultResponse = network.getMockImplementation()!;
    network.mockImplementation(async (url, options) => String(url).includes("/branches/")
      ? Response.json(
          scenario === "renamed"
            ? { name: "renamed", commit: { sha: "abc123" } }
            : { message: "private upstream details" },
          { status: upstream },
        )
      : defaultResponse(url, options));

    const response = await POST(importRequest());
    expect(response.status).toBe(expected);
    const body = await response.json();
    expect(body.error).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/test-token|private upstream/);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("dispatches saved identifiers without putting GitHub credentials in the job payload", async () => {
    const response = await POST(importRequest());
    expect(response.status).toBe(201);
    const [, options] = network.mock.calls.find(([url]) => String(url).startsWith("https://api.trigger.dev/"))!;
    expect(JSON.parse(String(options?.body)).payload).toEqual({
      projectId: "created-project", userId: "current-user", operationId: "created-operation",
    });
    expect(String(options?.body)).not.toMatch(/test-token|linked-account|clone_url/);
    expect(await response.text()).not.toMatch(/test-token|linked-account/);
  });

  it.each([
    { id: 123456789, permissions: { pull: false } },
    { id: 123456789 },
    { id: 999, permissions: { pull: true } },
  ])("rejects an inaccessible or mismatched repository: %j", async (repository) => {
    network.mockImplementation(async () => Response.json(repository));
    expect((await POST(importRequest())).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    { upstream: 401, expected: 403, code: "GITHUB_RECONNECT_REQUIRED", headers: {} },
    { upstream: 403, expected: 403, code: undefined, headers: {} },
    { upstream: 404, expected: 403, code: undefined, headers: {} },
    { upstream: 403, expected: 429, code: undefined, headers: { "x-ratelimit-remaining": "0" } },
    { upstream: 429, expected: 429, code: undefined, headers: {} },
    { upstream: 500, expected: 502, code: undefined, headers: {} },
  ])("does not insert when GitHub returns $upstream", async ({ upstream, expected, code, headers }) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    network.mockImplementation(async () => Response.json({ message: "private upstream details" }, { status: upstream, headers: headers as Record<string, string> }));
    const response = await POST(importRequest());
    const body = await response.json();
    expect(response.status).toBe(expected);
    expect(body.code).toBe(code);
    expect(JSON.stringify(body)).not.toMatch(/test-token|private upstream/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/test-token|private upstream/);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("rejects missing or unrefreshable tokens without contacting GitHub", async () => {
    mocks.getAccessToken.mockResolvedValueOnce({ accessToken: "" });
    expect((await POST(importRequest())).status).toBe(403);
    mocks.getAccessToken.mockRejectedValueOnce(new APIError("BAD_REQUEST", { code: "FAILED_TO_GET_ACCESS_TOKEN", message: "private upstream details" }));
    const response = await POST(importRequest());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "GITHUB_RECONNECT_REQUIRED" });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("does not require GitHub for a new project", async () => {
    mocks.listUserAccounts.mockResolvedValue([]);
    expect((await POST(request({ name: "New", source: "new" }))).status).toBe(201);
    expect(mocks.listUserAccounts).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toBe("https://api.trigger.dev/api/v1/tasks/handle-project-sandbox/trigger");
  });
});

describe("sandbox task submission", () => {
  it("submits the saved project after commit and records the run ID", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const req = request({ name: "My project", source: "new" });
    expect((await POST(req)).status).toBe(201);

    expect(network).toHaveBeenCalledTimes(1);
    const [url, options] = network.mock.calls[0];
    expect(url).toBe("https://api.trigger.dev/api/v1/tasks/handle-project-sandbox/trigger");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer test-trigger-secret");
    expect(JSON.parse(options?.body as string)).toEqual({
      payload: { projectId: "created-project", userId: "current-user", operationId: "created-operation" },
      options: { idempotencyKey: "handle-project-sandbox:created-operation", concurrencyKey: "created-project" },
    });
    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(options?.signal).not.toBe(req.signal);
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(network.mock.invocationCallOrder[0]);
    expect(mocks.update).toHaveBeenCalledWith(ProjectOperationTable);
    expect(mocks.set).toHaveBeenCalledWith({ triggerRunId: "run_sandbox", errorCode: null, errorMessage: null });
    expect(network.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it.each(["timeout", "rejected", "invalid-response"])("preserves the saved project when submission has a %s outcome", async (outcome) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    network.mockImplementation(async () => {
      if (outcome === "timeout") throw new DOMException("private upstream details", "TimeoutError");
      if (outcome === "rejected") return Response.json({ error: "private upstream details" }, { status: 503 });
      return Response.json({ unexpected: "private upstream details" });
    });

    const response = await POST(request({ name: "My project", source: "new" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ error: false, data: { id: "created-project" } });
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith({
      errorCode: "SANDBOX_DISPATCH_UNCONFIRMED",
      errorMessage: expect.stringContaining("retried automatically"),
    });
    expect(network).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/test-trigger-secret|private upstream details/);
  });

  it("preserves the saved project if recording an accepted run fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateReturning.mockRejectedValueOnce(new Error("Database unavailable"));
    const response = await POST(request({ name: "My project", source: "new" }));
    expect(response.status).toBe(201);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(network).toHaveBeenCalledTimes(1);
  });
});
