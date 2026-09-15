import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/projects/[projectId]/git/counts+api";
import { SandboxFilesError } from "@/services/daytona/api";
const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), repository: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/project-workspace", () => ({ getUserReadyProject: mocks.project }));
vi.mock("@/services/daytona/branches", () => ({ getSandboxGitRepository: mocks.repository }));
vi.mock("@/services/daytona/api", async (original) => ({ ...await original<object>(), requestDaytona: mocks.request }));
vi.mock("@/data/env/server", () => ({ serverEnv: {} }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
const projectId = "abcdef00-0000-4000-8000-000000000001";
const counts = { currentBranch: "main", headSha: "a".repeat(40), upstream: null, upstreamSha: null, outgoing: null, incoming: null, isShallow: false, observedAt: "2026-09-15T00:00:00.000Z" };
const request = () => new Request(`https://codaloud.test/api/projects/${projectId}/git/counts`);
beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "user-one" });
  mocks.project.mockReset().mockResolvedValue({ id: projectId, sandboxId: "sandbox" });
  mocks.repository.mockReset().mockResolvedValue({ toolboxUrl: "https://toolbox.test/sandbox", repositoryPath: "/home/daytona/.codaloud/workspace" });
  mocks.request.mockReset().mockResolvedValue({ exitCode: 0, result: JSON.stringify(counts) });
});
it("authenticates, checks ownership, and executes through requestDaytona", async () => {
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(counts);
  expect(mocks.project).toHaveBeenCalledWith("user-one", projectId);
  expect(mocks.repository).toHaveBeenCalledWith("sandbox", projectId);
  expect(mocks.request).toHaveBeenCalledWith("https://toolbox.test/sandbox/process/execute", expect.objectContaining({ method: "POST" }));
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("rejects unauthenticated requests before workspace access", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await GET(request(), { projectId })).status).toBe(401);
  expect(mocks.project).not.toHaveBeenCalled();
});
it("rejects invalid project IDs", async () => {
  expect((await GET(request(), { projectId: "bad" })).status).toBe(400);
  expect(mocks.project).not.toHaveBeenCalled();
});
it.each([[404, "PROJECT_NOT_FOUND"], [409, "PROJECT_DELETING"], [503, "WORKSPACE_RESTORING"]] as const)("preserves workspace failure %s", async (status, code) => {
  mocks.project.mockRejectedValue(new SandboxFilesError(status, code, "Safe message"));
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(status);
  expect(mocks.request).not.toHaveBeenCalled();
  if (status === 503) expect(response.headers.get("Retry-After")).toBe("3");
});
it("sanitizes provider failures and malformed output without retrying", async () => {
  mocks.request.mockResolvedValue({ exitCode: 0, result: "credential-secret" });
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("credential-secret");
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
