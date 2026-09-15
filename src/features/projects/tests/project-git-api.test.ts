import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/projects/[projectId]/git/counts+api";
import { SandboxFilesError } from "@/services/daytona/api";
const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), repository: vi.fn(), request: vi.fn(), credentials: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/project-workspace", () => ({ getUserReadyProject: mocks.project }));
vi.mock("@/services/daytona/branches", () => ({ getSandboxGitRepository: mocks.repository }));
vi.mock("@/services/daytona/api", async (original) => ({ ...await original<object>(), requestDaytona: mocks.request }));
vi.mock("@/data/env/server", () => ({ serverEnv: {} }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("@/services/github/server/access", () => ({ getGitHubCredentials: mocks.credentials, getGitHubErrorResponse: () => ({ status: 403, body: { error: true, code: "GITHUB_ACCESS_DENIED", message: "Access denied." } }) }));
vi.mock("@/services/github/server/repositories", () => ({ verifyGitHubRepositoryAccess: mocks.access }));
const projectId = "abcdef00-0000-4000-8000-000000000001";
const counts = { currentBranch: "main", headSha: "a".repeat(40), upstream: null, upstreamSha: null, outgoing: null, incoming: null, isShallow: false, observedAt: "2026-09-15T00:00:00.000Z" };
const request = () => new Request(`https://codaloud.test/api/projects/${projectId}/git/counts`);
beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "user-one", user: { name: "Ada", email: "ada@example.com" } });
  mocks.project.mockReset().mockResolvedValue({ id: projectId, sandboxId: "sandbox", githubRepositoryId: "123" });
  mocks.credentials.mockReset().mockResolvedValue({ accessToken: "secret" });
  mocks.access.mockReset().mockResolvedValue({ fullName: "example/repo", permissions: { push: true, pull: true }, archived: false });
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

// Every mutation goes through the real shared route and transport adapter.
import { POST as createBranch } from "@/app/api/projects/[projectId]/git/branches+api";
const expected = { expectedBranch: "main", expectedHeadSha: "a".repeat(40) };
const mutationRequest = (body: unknown, contentType = "application/json") => new Request(`https://codaloud.test/api/projects/${projectId}/git`, {
  method: "POST", headers: { "Content-Type": contentType }, body: JSON.stringify(body),
});
import { POST as stashPush } from "@/app/api/projects/[projectId]/git/stash+api";
import { POST as stashPop } from "@/app/api/projects/[projectId]/git/stash-pop+api";
import { POST as discard } from "@/app/api/projects/[projectId]/git/discard+api";
import { POST as revert } from "@/app/api/projects/[projectId]/git/revert+api";
import { POST as fetchGit } from "@/app/api/projects/[projectId]/git/fetch+api";
import { POST as pushGit } from "@/app/api/projects/[projectId]/git/push+api";
import { POST as pullGit } from "@/app/api/projects/[projectId]/git/pull+api";
const mutationRoutes = [
  { name: "pull", handler: pullGit, input: { ...expected, remoteBranch: "main", rebase: false }, output: { previousHeadSha: expected.expectedHeadSha, headSha: expected.expectedHeadSha, currentBranch: "main", rebased: false, counts } },
  { name: "push", handler: pushGit, input: { ...expected, remoteBranch: "main", force: false }, output: { pushed: true, remoteBranch: "main", remoteSha: expected.expectedHeadSha, trackingUpdated: true, counts } },
  { name: "fetch", handler: fetchGit, input: { ...expected }, output: counts },
  { name: "revert", handler: revert, input: { ...expected }, output: { hash: "b".repeat(40), parentHash: expected.expectedHeadSha, currentBranch: "main" } },
  { name: "discard", handler: discard, input: { ...expected, confirm: true, includeUntracked: false, fingerprint: "c".repeat(64) }, output: { headSha: expected.expectedHeadSha, remainingChanges: false } },
  { name: "pop stash", handler: stashPop, input: { ...expected, stashIndex: 0, stashSha: "b".repeat(40) }, output: { stashSha: "b".repeat(40), dropped: true } },
  { name: "stash all", handler: stashPush, input: { ...expected, message: "Saved" }, output: { created: true, stashSha: "b".repeat(40) } },
  { name: "create branch", handler: createBranch, input: { ...expected, branchName: "feature/new" }, output: { previousBranch: "main", currentBranch: "feature/new", headSha: expected.expectedHeadSha } },
];
for (const route of mutationRoutes) {
  it(`${route.name}: executes valid input`, async () => {
    mocks.request.mockResolvedValue({ exitCode: 0, result: JSON.stringify(route.output) });
    const response = await route.handler(mutationRequest(route.input), { projectId });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(route.output);
  });
  it(`${route.name}: authenticates before reading the workspace`, async () => {
    mocks.user.mockResolvedValue({ userId: null });
    expect((await route.handler(mutationRequest(route.input), { projectId })).status).toBe(401);
    expect(mocks.project).not.toHaveBeenCalled();
  });
  it(`${route.name}: rejects invalid IDs, media types, missing state and extra fields`, async () => {
    expect((await route.handler(mutationRequest(route.input), { projectId: "bad" })).status).toBe(400);
    expect((await route.handler(mutationRequest(route.input, "text/plain"), { projectId })).status).toBe(415);
    expect((await route.handler(mutationRequest({}), { projectId })).status).toBe(400);
    expect((await route.handler(mutationRequest({ ...route.input, command: "rm" }), { projectId })).status).toBe(400);
    expect(mocks.project).not.toHaveBeenCalled();
  });
  it(`${route.name}: checks project ownership before executing`, async () => {
    mocks.project.mockRejectedValue(new SandboxFilesError(404, "PROJECT_NOT_FOUND", "Project not found."));
    expect((await route.handler(mutationRequest(route.input), { projectId })).status).toBe(404);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it(`${route.name}: maps conflicts and never retries uncertain execution`, async () => {
    mocks.request.mockResolvedValue({ exitCode: 1, result: JSON.stringify({ code: "WORKSPACE_CHANGED" }) });
    expect((await route.handler(mutationRequest(route.input), { projectId })).status).toBe(409);
    mocks.request.mockRejectedValue(new Error("secret-token"));
    const response = await route.handler(mutationRequest(route.input), { projectId });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: true, code: "GIT_OUTCOME_UNKNOWN" });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
}

import { GET as viewStash } from "@/app/api/projects/[projectId]/git/stash+api";
it("view stash: validates pagination and returns an empty collection", async () => {
  mocks.request.mockResolvedValue({ exitCode: 0, result: JSON.stringify({ stashes: [], nextOffset: null, patch: null }) });
  expect((await viewStash(request(), { projectId })).status).toBe(200);
  expect((await viewStash(new Request("https://codaloud.test/?pageSize=1000"), { projectId })).status).toBe(400);
  expect((await viewStash(new Request("https://codaloud.test/?index=0"), { projectId })).status).toBe(400);
});

it("revert: requires a valid server-resolved commit identity", async () => {
  mocks.user.mockResolvedValue({ userId: "user-one", user: { name: "Ada", email: "bad" } });
  expect((await revert(mutationRequest(expected), { projectId })).status).toBe(422);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("fetch: requires connected repository access before command execution", async () => {
  mocks.credentials.mockRejectedValue(new Error("token-secret"));
  expect((await fetchGit(mutationRequest(expected), { projectId })).status).toBe(403);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("push: rejects string booleans and force without a lease", async () => {
  for (const input of [{ ...expected, remoteBranch: "main", force: "false" }, { ...expected, remoteBranch: "main", force: true }]) {
    expect((await pushGit(mutationRequest(input), { projectId })).status).toBe(400);
  }
  expect(mocks.request).not.toHaveBeenCalled();
});
it("push: checks write permission before transport", async () => {
  mocks.access.mockResolvedValue({ fullName: "example/repo", permissions: { push: false } });
  expect((await pushGit(mutationRequest({ ...expected, remoteBranch: "main" }), { projectId })).status).toBe(403);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("pull: rejects string rebase options", async () => {
  expect((await pullGit(mutationRequest({ ...expected, remoteBranch: "main", rebase: "true" }), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});
