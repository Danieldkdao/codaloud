import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGitRoute } from "../server/git-route";
import { CommitHistoryError } from "../server/commit-pagination";
import { SandboxFilesError } from "@/services/daytona/api";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), operation: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("../server/project-workspace", () => ({ getUserReadyProject: mocks.project }));
vi.mock("@/services/daytona/git-operation", () => ({ executeGitOperation: mocks.operation }));
vi.mock("@/data/env/server", () => ({ serverEnv: {} }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));

const projectId = "abcdef00-0000-4000-8000-000000000001";
const request = (query = "") => new Request(`https://codaloud.test/api/projects/${projectId}/history${query}`, { headers: { Cookie: "session=valid" } });
beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.project.mockReset();
  mocks.operation.mockReset();
});

it("passes authenticated context and validated input to an existing service without requiring a local sandbox", async () => {
  const execute = vi.fn().mockResolvedValue({ value: "remote history", secret: "hidden" });
  const route = createGitRoute({
    input: z.strictObject({ source: z.literal("remote") }), output: z.object({ value: z.string() }),
    message: "Loaded.", execute,
  });
  const input = request("?source=remote");
  const response = await route(input, { projectId });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ request: input, params: { projectId }, userId: "owner", input: { source: "remote" } });
  expect(await response.json()).toEqual({ error: false, message: "Loaded.", data: { value: "remote history" } });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.operation).not.toHaveBeenCalled();
});

it("authenticates and validates before dispatching service callbacks", async () => {
  const execute = vi.fn();
  const route = createGitRoute({ input: z.strictObject({}), output: z.unknown(), message: "Loaded.", execute });
  mocks.user.mockResolvedValueOnce({ userId: null });
  expect((await route(request(), { projectId })).status).toBe(401);
  expect((await route(request(), { projectId: "invalid" })).status).toBe(400);
  expect((await route(request("?unexpected=value"), { projectId })).status).toBe(400);
  expect(execute).not.toHaveBeenCalled();
});

it("rejects duplicate queries and path-parameter overrides before query mapping", async () => {
  const execute = vi.fn();
  const query = vi.fn((values: URLSearchParams, params: { projectId: string }) => ({ ...Object.fromEntries(values), ...params }));
  const route = createGitRoute({ input: z.unknown(), output: z.unknown(), message: "Loaded.", query, execute });
  for (const suffix of ["?source=local&source=remote", "?projectId=other", "?commitSha=other"]) {
    expect((await route(request(suffix), { projectId, commitSha: "a".repeat(40) })).status).toBe(400);
  }
  expect(query).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

it.each([
  new SandboxFilesError(503, "WORKSPACE_RESTORING", "Restoring."),
  new CommitHistoryError(400, "INVALID_COMMIT_CURSOR", "Refresh history."),
])("preserves known service errors and restoration headers", async (error) => {
  const execute = vi.fn().mockRejectedValue(error);
  const route = createGitRoute({ input: z.strictObject({}), output: z.unknown(), message: "Loaded.", execute });
  const response = await route(request(), { projectId });
  expect(response.status).toBe(error.status);
  expect(await response.json()).toEqual({ error: true, code: error.code, message: error.message });
  expect(response.headers.get("Retry-After")).toBe(error.status === 503 ? "3" : null);
});

it("validates output and preserves operation-specific unknown outcomes without retrying", async () => {
  const execute = vi.fn().mockResolvedValue({ value: 42 });
  const route = createGitRoute({
    input: z.strictObject({}), output: z.object({ value: z.string() }), message: "Saved.", mutation: true, execute,
    errors: { unknownOutcome: { code: "COMMIT_OUTCOME_UNKNOWN", message: "Refresh history." } },
  });
  const response = await route(new Request(request().url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), { projectId });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: true, code: "COMMIT_OUTCOME_UNKNOWN", message: "Refresh history." });
  expect(execute).toHaveBeenCalledTimes(1);
});

it("bounds service request bodies before execution, including streaming bodies without Content-Length", async () => {
  const execute = vi.fn();
  const cancel = vi.fn();
  const body = new ReadableStream({ start: (controller) => controller.enqueue(new TextEncoder().encode('{"value":"oversized"}')), cancel });
  const route = createGitRoute({ input: z.unknown(), output: z.unknown(), message: "Saved.", mutation: true, maxBodyBytes: 10, execute });
  const input = new Request(request().url, { method: "POST", headers: { "Content-Type": "application/json" }, body, duplex: "half" } as RequestInit);
  expect((await route(input, { projectId })).status).toBe(413);
  expect(cancel).toHaveBeenCalledOnce();
  expect(execute).not.toHaveBeenCalled();
});
