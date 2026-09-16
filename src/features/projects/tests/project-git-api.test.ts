import { beforeEach, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import { GET } from "@/app/api/projects/[projectId]/git/counts+api";
import { SandboxFilesError } from "@/services/daytona/api";
import { POST as createBranch } from "@/app/api/projects/[projectId]/git/branches+api";
import { POST as stashPush } from "@/app/api/projects/[projectId]/git/stash+api";
import { POST as stashPop } from "@/app/api/projects/[projectId]/git/stash-pop+api";
import { POST as discard, GET as previewDiscard } from "@/app/api/projects/[projectId]/git/discard+api";
import { POST as revert } from "@/app/api/projects/[projectId]/git/revert+api";
import { POST as undo } from "@/app/api/projects/[projectId]/git/undo+api";
import { POST as fetchGit } from "@/app/api/projects/[projectId]/git/fetch+api";
import { POST as pushGit } from "@/app/api/projects/[projectId]/git/push+api";
import { POST as pullGit } from "@/app/api/projects/[projectId]/git/pull+api";
import { GET as viewStash } from "@/app/api/projects/[projectId]/git/stash+api";

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
const expected = { expectedBranch: "main", expectedHeadSha: "a".repeat(40) };
const mutationRequest = (body: unknown, contentType = "application/json") => new Request(`https://codaloud.test/api/projects/${projectId}/git`, {
  method: "POST", headers: { "Content-Type": contentType }, body: JSON.stringify(body),
});
const mutationRoutes = [
  { name: "undo", handler: undo, input: { mode: "soft" }, output: { previousHeadSha: expected.expectedHeadSha, headSha: "b".repeat(40), currentBranch: "main", mode: "soft" } },
  { name: "pull", handler: pullGit, input: { rebase: false }, output: { previousHeadSha: expected.expectedHeadSha, headSha: expected.expectedHeadSha, currentBranch: "main", rebased: false, counts } },
  { name: "push", handler: pushGit, input: { force: false }, output: { pushed: true, remoteBranch: "main", remoteSha: expected.expectedHeadSha, trackingUpdated: true, counts } },
  { name: "fetch", handler: fetchGit, input: {}, output: counts },
  { name: "revert", handler: revert, input: {}, output: { hash: "b".repeat(40), parentHash: expected.expectedHeadSha, currentBranch: "main" } },
  { name: "discard", handler: discard, input: { confirm: true, includeUntracked: false, fingerprint: "c".repeat(64) }, output: { headSha: expected.expectedHeadSha, remainingChanges: false } },
  { name: "pop stash", handler: stashPop, input: { stashIndex: 0, stashSha: "b".repeat(40) }, output: { stashSha: "b".repeat(40), dropped: true } },
  { name: "stash all", handler: stashPush, input: { message: "Saved" }, output: { created: true, remainingChanges: false, stashSha: "b".repeat(40) } },
  { name: "create branch", handler: createBranch, input: { branchName: "feature/new" }, output: { previousBranch: "main", currentBranch: "feature/new", headSha: expected.expectedHeadSha } },
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
  it(`${route.name}: rejects invalid IDs, media types, invalid bodies and extra fields`, async () => {
    expect((await route.handler(mutationRequest(route.input), { projectId: "bad" })).status).toBe(400);
    expect((await route.handler(mutationRequest(route.input, "text/plain"), { projectId })).status).toBe(415);
    expect((await route.handler(mutationRequest(null), { projectId })).status).toBe(400);
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

it("view stash: validates pagination and returns an empty collection", async () => {
  mocks.request.mockResolvedValue({ exitCode: 0, result: JSON.stringify({ stashes: [], nextCursor: null, patch: null }) });
  expect((await viewStash(request(), { projectId })).status).toBe(200);
  expect((await viewStash(new Request("https://codaloud.test/?pageSize=1000"), { projectId })).status).toBe(400);
  expect((await viewStash(new Request("https://codaloud.test/?index=0"), { projectId })).status).toBe(400);
});

it("view stash: forwards trimmed search and pagination through requestDaytona", async () => {
  const output = { stashes: [{ index: 7, sha: "b".repeat(40), message: "On main: Login", createdAt: "2026-09-15T00:00:00Z" }], nextCursor: "opaque-next-cursor", patch: null };
  mocks.request.mockResolvedValue({ exitCode: 0, result: JSON.stringify(output) });
  const response = await viewStash(new Request("https://codaloud.test/?search=%20Login%20&cursor=opaque-cursor&pageSize=1"), { projectId });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(output);
  const { envs } = JSON.parse(mocks.request.mock.calls[0][1].body);
  const encoded = Array.from({ length: Number(envs.CODALOUD_INPUT_CHUNKS) }, (_, index) => envs[`CODALOUD_INPUT_${index}`]).join("");
  expect(JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"))).toMatchObject({ search: "Login", cursor: "opaque-cursor", pageSize: 1, projectId, sandboxId: "sandbox" });
});

it.each(["", "   "])("view stash: accepts blank search %j", async (search) => {
  mocks.request.mockResolvedValue({ exitCode: 0, result: JSON.stringify({ stashes: [], nextCursor: null, patch: null }) });
  expect((await viewStash(new Request("https://codaloud.test/?" + new URLSearchParams({ search })), { projectId })).status).toBe(200);
});

it.each<Record<string, string>>([
  { search: "x".repeat(201) },
  { search: "one\ntwo" },
  { search: "one\0two" },
  { search: "login", index: "0", stashSha: "b".repeat(40) },
])("view stash: rejects invalid or ambiguous search %j before workspace access", async (query) => {
  const params = new URLSearchParams(query);
  expect((await viewStash(new Request("https://codaloud.test/?" + params), { projectId })).status).toBe(400);
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("view stash: rejects duplicate search parameters", async () => {
  expect((await viewStash(new Request("https://codaloud.test/?search=one&search=two"), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each(["offset=0", "page=1", "cursor=", "cursor=bad!", "cursor=" + "x".repeat(4097), "cursor=one&cursor=two", "index=0&stashSha=" + "b".repeat(40) + "&cursor=opaque"])(
  "view stash: rejects legacy pagination and invalid cursors %s", async (query) => {
    expect((await viewStash(new Request("https://codaloud.test/?" + query), { projectId })).status).toBe(400);
    expect(mocks.request).not.toHaveBeenCalled();
  },
);

it.each([["INVALID_STASH_CURSOR", 400], ["GIT_STASH_CHANGED", 409]] as const)(
  "view stash: maps %s to %s without retrying", async (code, status) => {
    mocks.request.mockResolvedValue({ exitCode: 1, result: JSON.stringify({ code }) });
    const response = await viewStash(new Request("https://codaloud.test/?cursor=opaque"), { projectId });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  },
);

it("revert: requires a valid server-resolved commit identity", async () => {
  mocks.user.mockResolvedValue({ userId: "user-one", user: { name: "Ada", email: "bad" } });
  expect((await revert(mutationRequest({}), { projectId })).status).toBe(422);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("fetch: requires connected repository access before command execution", async () => {
  mocks.credentials.mockRejectedValue(new Error("token-secret"));
  expect((await fetchGit(mutationRequest({}), { projectId })).status).toBe(403);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("push: rejects string booleans and force without a lease", async () => {
  for (const input of [{ force: "false" }, { force: true }]) {
    expect((await pushGit(mutationRequest(input), { projectId })).status).toBe(400);
  }
  expect(mocks.request).not.toHaveBeenCalled();
});
it("push: checks write permission before transport", async () => {
  mocks.access.mockResolvedValue({ fullName: "example/repo", permissions: { push: false } });
  expect((await pushGit(mutationRequest({}), { projectId })).status).toBe(403);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("pull: rejects string rebase options", async () => {
  expect((await pullGit(mutationRequest({ rebase: "true" }), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("stash all: uses the account identity rather than requiring repository identity configuration", async () => {
  mocks.user.mockResolvedValue({ userId: "user-one", user: { name: "", email: "bad" } });
  expect((await stashPush(mutationRequest({}), { projectId })).status).toBe(422);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("rejects oversized JSON before accessing the workspace", async () => {
  expect((await stashPush(mutationRequest({ ...expected, message: "a".repeat(70000) }), { projectId })).status).toBe(413);
  expect(mocks.project).not.toHaveBeenCalled();
});
it("rejects mutation query flags rather than silently ignoring them", async () => {
  const input = new Request(`https://codaloud.test/?force=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...expected, remoteBranch: "main" }) });
  expect((await pushGit(input, { projectId })).status).toBe(400);
  expect(mocks.project).not.toHaveBeenCalled();
});

it.each([{}, { branchName: "new", expectedBranch: "main" }, { branchName: "new", expectedHeadSha: "a".repeat(40) }, { branchName: "new", startPoint: "other" }])("create branch: rejects missing name and caller-selected source %j", async (input) => {
  expect((await createBranch(mutationRequest(input), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("stash all: rejects caller-supplied branch state", async () => {
  expect((await stashPush(mutationRequest(expected), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("pop stash: rejects caller-supplied branch state", async () => {
  expect((await stashPop(mutationRequest({ ...expected, stashIndex: 0, stashSha: "b".repeat(40) }), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("discard: previews server-derived state and rejects state overrides", async () => {
  const preview = { currentBranch: "feature/current", headSha: "a".repeat(40), fingerprint: "c".repeat(64), changedPaths: ["file.txt"] };
  mocks.request.mockResolvedValue({ exitCode: 0, result: JSON.stringify(preview) });
  const response = await previewDiscard(request(), { projectId });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(preview);
  expect((await discard(mutationRequest({ ...expected, fingerprint: preview.fingerprint, confirm: true, includeUntracked: false }), { projectId })).status).toBe(400);
});

it("revert: rejects caller-selected branch and commit", async () => {
  expect((await revert(mutationRequest(expected), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("fetch: rejects caller-selected branch state", async () => {
  expect((await fetchGit(mutationRequest(expected), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each([{ expectedBranch: "main" }, { expectedHeadSha: "a".repeat(40) }, { remoteBranch: "other" }])("push: rejects caller-selected branch state %j", async (input) => {
  expect((await pushGit(mutationRequest(input), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each([{ expectedBranch: "main" }, { expectedHeadSha: "a".repeat(40) }, { remoteBranch: "other" }])("pull: rejects caller-selected branch state %j", async (input) => {
  expect((await pullGit(mutationRequest(input), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each(["soft", "mixed", "hard"])("undo: forwards explicit %s mode through requestDaytona without GitHub or author requirements", async (mode) => {
  mocks.user.mockResolvedValue({ userId: "user-one" });
  mocks.project.mockResolvedValue({ id: projectId, sandboxId: "sandbox", githubRepositoryId: null });
  const output = { previousHeadSha: "a".repeat(40), headSha: "b".repeat(40), currentBranch: "feature/current", mode };
  mocks.request.mockResolvedValue({ exitCode: 0, result: JSON.stringify(output) });
  const response = await undo(mutationRequest({ mode }), { projectId });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(output);
  const [url, init] = mocks.request.mock.calls[0];
  expect(url).toBe("https://toolbox.test/sandbox/process/execute");
  const command = JSON.parse(init.body);
  const chunks = Array.from({ length: Number(command.envs.CODALOUD_INPUT_CHUNKS) }, (_, index) => command.envs[`CODALOUD_INPUT_${index}`]).join("");
  expect(JSON.parse(gunzipSync(Buffer.from(chunks, "base64")).toString())).toMatchObject({ mode, projectId, sandboxId: "sandbox", repositoryPath: "/home/daytona/.codaloud/workspace" });
  expect(mocks.project).toHaveBeenCalledWith("user-one", projectId);
  expect(mocks.credentials).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it.each([
  {}, { mode: "" }, { mode: "--hard" }, { mode: "keep" }, { mode: "HARD" }, { mode: true },
  { mode: "hard; echo injected" }, { mode: "soft", branch: "other" },
  { mode: "mixed", expectedBranch: "main" }, { mode: "hard", expectedHeadSha: "a".repeat(40) },
  { mode: "soft", commitSha: "b".repeat(40) }, { mode: "mixed", mainline: 2 },
])("undo: rejects invalid mode or caller-selected state %j", async (input) => {
  expect((await undo(mutationRequest(input), { projectId })).status).toBe(400);
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("undo: rejects mutation query flags and malformed command output", async () => {
  const input = mutationRequest({ mode: "soft" });
  expect((await undo(new Request(`${input.url}?mode=hard`, input), { projectId })).status).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.request.mockResolvedValue({ exitCode: 0, result: JSON.stringify({ headSha: "invalid", secret: "hidden" }) });
  const response = await undo(mutationRequest({ mode: "soft" }), { projectId });
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ code: "GIT_OUTCOME_UNKNOWN" });
  expect(mocks.request).toHaveBeenCalledOnce();
});

it.each([["GIT_PARENT_REQUIRED", 409], ["GIT_HISTORY_INCOMPLETE", 422], ["GIT_OPERATION_IN_PROGRESS", 409]] as const)("undo: preserves %s as a safe %s error", async (code, status) => {
  mocks.request.mockResolvedValue({ exitCode: 1, result: JSON.stringify({ code }) });
  const response = await undo(mutationRequest({ mode: "hard" }), { projectId });
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ code });
});
