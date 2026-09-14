import { beforeEach, expect, it, vi } from "vitest";
import { RequestError } from "octokit";
import { POST } from "@/app/api/projects/[projectId]/checkout+api";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), project: vi.fn(), accounts: vi.fn(), token: vi.fn(), repository: vi.fn(),
  sandbox: vi.fn(), home: vi.fn(), branches: vi.fn(), checkout: vi.fn(), fetch: vi.fn(),
}));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { listUserAccounts: mocks.accounts, getAccessToken: mocks.token } } }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/services/github/server/repositories", () => ({ verifyGitHubRepositoryAccess: mocks.repository }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-server-key" } }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("@daytona/sdk", () => { throw new Error("Checkout routes must not import the Daytona SDK."); });

const projectId = "abcdef00-0000-4000-8000-000000000001";
const userId = "abcdef00-0000-4000-8000-000000000002";
const project = { id: projectId, sandboxId: "owned-sandbox", setupStatus: "ready", deletionRequested: false, githubRepositoryId: "123" };
const sandbox = {
  id: "owned-sandbox", state: "started", toolboxProxyUrl: "https://toolbox.daytona.test",
  labels: { codaloudApp: "codaloud", codaloudProjectId: projectId },
};
const request = (body: unknown = { branchName: "feature/voice" }, contentType = "application/json") =>
  new Request(`https://codaloud.test/api/projects/${projectId}/checkout`, {
    method: "POST", headers: { Cookie: "session=valid", "Content-Type": contentType }, body: JSON.stringify(body),
  });
const checkout = async (body?: unknown) => {
  const response = await POST(request(body), { projectId });
  return { response, body: await response.json() };
};
let currentBranch: string;

beforeEach(() => {
  currentBranch = "main";
  mocks.user.mockReset().mockResolvedValue({ userId });
  mocks.project.mockReset().mockResolvedValue(project);
  mocks.accounts.mockReset().mockResolvedValue([{ id: "linked-account", providerId: "github", scopes: ["repo"] }]);
  mocks.token.mockReset().mockResolvedValue({ accessToken: "test-github-token" });
  mocks.repository.mockReset().mockResolvedValue({ id: 123, fullName: "owner/repo" });
  mocks.sandbox.mockReset().mockResolvedValue(sandbox);
  mocks.home.mockReset().mockResolvedValue({ dir: "/home/daytona" });
  mocks.branches.mockReset().mockImplementation(() => ({ branches: ["main", "feature/voice"], current: currentBranch }));
  mocks.checkout.mockReset().mockImplementation(({ branch }: { branch: string }) => {
    currentBranch = branch;
    return new Response(null, { status: 204 });
  });
  mocks.fetch.mockReset().mockImplementation(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    let result: unknown;
    if (url.pathname === "/api/sandbox/owned-sandbox") result = await mocks.sandbox();
    else if (url.pathname === "/api/sandbox/owned-sandbox/start") result = {};
    else if (url.pathname === "/owned-sandbox/user-home-dir") result = await mocks.home();
    else if (url.pathname === "/owned-sandbox/git/branches") result = await mocks.branches(url.searchParams.get("path"));
    else if (url.pathname === "/owned-sandbox/git/checkout") result = await mocks.checkout(JSON.parse(String(init.body)));
    else throw new Error("Unexpected Daytona request");
    return result instanceof Response ? result : Response.json(result);
  });
  vi.stubGlobal("fetch", mocks.fetch);
});

it("authorizes the stored project/repository and checks out through HTTP, then verifies the current branch", async () => {
  const input = request();
  const response = await POST(input, { projectId });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ error: false, data: { previousBranch: "main", currentBranch: "feature/voice" } });
  expect(mocks.user).toHaveBeenCalledExactlyOnceWith(input.headers);
  expect(mocks.project).toHaveBeenCalledExactlyOnceWith(userId, projectId);
  expect(mocks.repository).toHaveBeenCalledWith("test-github-token", "123", expect.any(AbortSignal));
  expect(mocks.repository.mock.invocationCallOrder[0]).toBeLessThan(mocks.sandbox.mock.invocationCallOrder[0]);
  expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith({ path: "/home/daytona/.codaloud/workspace", branch: "feature/voice" });
  expect(mocks.branches).toHaveBeenCalledTimes(2);
  expect(mocks.fetch).toHaveBeenCalledWith("https://toolbox.daytona.test/owned-sandbox/git/checkout", expect.objectContaining({ method: "POST" }));
  for (const [, options] of mocks.fetch.mock.calls) {
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-server-key");
    expect(JSON.stringify(options)).not.toContain("test-github-token");
  }
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
});

it("supports projects without a linked GitHub repository", async () => {
  mocks.project.mockResolvedValue({ ...project, githubRepositoryId: null });
  expect((await checkout()).response.status).toBe(200);
  expect(mocks.accounts).not.toHaveBeenCalled();
  expect(mocks.repository).not.toHaveBeenCalled();
});

it("treats a request for the already checked-out branch as a no-op", async () => {
  const result = await checkout({ branchName: "main" });
  expect(result.body.data).toEqual({ previousBranch: "main", currentBranch: "main" });
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("rejects missing sessions and invalid project IDs before accessing the workspace", async () => {
  mocks.user.mockResolvedValueOnce({ userId: null });
  expect((await checkout()).response.status).toBe(401);
  expect((await POST(request(), { projectId: "invalid" })).status).toBe(400);
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each([{}, null, { branchName: 1 }, { branchName: "" }, { branchName: " main " },
  { branchName: "-f" }, { branchName: "HEAD" }, { branchName: "@" }, { branchName: "@{-1}" },
  { branchName: "refs/heads/main" }, { branchName: "../main" }, { branchName: "main\n-f" },
  { branchName: "main", force: true }, { branchName: "main", sandboxId: "another" },
])("rejects invalid checkout inputs before authorization lookups: %j", async (body) => {
  const result = await checkout(body);
  expect(result.response.status).toBe(400);
  expect(result.body).toMatchObject({ error: true, code: "INVALID_BRANCH" });
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("rejects non-JSON and malformed JSON bodies", async () => {
  expect((await POST(request({}, "text/plain"), { projectId })).status).toBe(415);
  const invalid = new Request(request().url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  expect((await POST(invalid, { projectId })).status).toBe(400);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each([
  [null, 404, "PROJECT_NOT_FOUND"],
  [{ ...project, deletionRequested: true }, 409, "PROJECT_DELETING"],
  [{ ...project, setupStatus: "pending" }, 409, "WORKSPACE_NOT_READY"],
  [{ ...project, sandboxId: null }, 409, "WORKSPACE_NOT_READY"],
] as const)("rejects inaccessible projects before checking repository access", async (value, status, code) => {
  mocks.project.mockResolvedValue(value);
  const result = await checkout();
  expect(result.response.status).toBe(status);
  expect(result.body.code).toBe(code);
  expect(mocks.accounts).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("requires a connected GitHub account for linked repositories", async () => {
  mocks.accounts.mockResolvedValue([]);
  const result = await checkout();
  expect(result.response.status).toBe(403);
  expect(result.body.code).toBe("GITHUB_RECONNECT_REQUIRED");
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each([403, 404])("rejects revoked repository access (%s) before contacting Daytona", async (status) => {
  mocks.repository.mockRejectedValue(new RequestError("private provider details test-github-token", status, {
    request: { method: "GET", url: "https://api.github.com/repositories/123", headers: {} },
  }));
  const result = await checkout();
  expect(result.response.status).toBe(403);
  expect(result.body.message).toMatch(/permissions/i);
  expect(JSON.stringify(result.body)).not.toMatch(/test-github-token|private provider details/);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("rejects sandbox identity mismatches", async () => {
  mocks.sandbox.mockResolvedValue({ ...sandbox, labels: { ...sandbox.labels, codaloudProjectId: "another" } });
  const result = await checkout();
  expect(result.response.status).toBe(409);
  expect(result.body.code).toBe("SANDBOX_MISMATCH");
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("returns a retryable restoration response without attempting checkout", async () => {
  mocks.sandbox.mockResolvedValue({ ...sandbox, state: "archived" });
  const result = await checkout();
  expect(result.response.status).toBe(503);
  expect(result.response.headers.get("Retry-After")).toBe("3");
  expect(result.body.code).toBe("WORKSPACE_RESTORING");
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("rejects missing local branches, including remote-only names and commit hashes", async () => {
  for (const branchName of ["missing", "origin/feature", "a".repeat(40)]) {
    const result = await checkout({ branchName });
    expect(result.response.status).toBe(404);
    expect(result.body.code).toBe("BRANCH_NOT_FOUND");
    expect(result.body.message).toMatch(/sandbox/i);
  }
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it.each([
  ["error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/app.ts\nPlease commit your changes or stash them before you switch branches.\nAborting", "CHECKOUT_CHANGES_CONFLICT", /commit|stash/i],
  ["error: The following untracked working tree files would be overwritten by checkout:\n\tnotes.txt\nPlease move or remove them before you switch branches.", "CHECKOUT_UNTRACKED_CONFLICT", /move|commit/i],
  ["error: you need to resolve your current index first", "CHECKOUT_UNRESOLVED_CONFLICTS", /resolve/i],
  ["fatal: Unable to create '/home/daytona/.codaloud/workspace/.git/index.lock': File exists.", "CHECKOUT_REPOSITORY_BUSY", /wait/i],
  ["error: pathspec 'feature/voice' did not match any file(s) known to git", "BRANCH_NOT_FOUND", /refresh/i],
  ["fatal: not a git repository (or any of the parent directories): .git", "WORKSPACE_REPOSITORY_MISSING", /repository/i],
  ["fatal: cannot create directory: No space left on device", "CHECKOUT_DISK_FULL", /space/i],
  ["fatal: unable to unlink old file: Permission denied", "CHECKOUT_PERMISSION_DENIED", /permission/i],
] as const)("returns an actionable checkout failure from Daytona: %s", async (message, code, guidance) => {
  mocks.checkout.mockResolvedValue(Response.json({ error: message }, { status: 500 }));
  const result = await checkout();
  expect(result.response.status).toBe(code === "BRANCH_NOT_FOUND" ? 404 : 409);
  expect(result.body).toMatchObject({ error: true, code, message: expect.stringMatching(guidance) });
  expect(currentBranch).toBe("main");
  expect(mocks.checkout).toHaveBeenCalledOnce();
});

it("preserves useful affected paths in conflict messages", async () => {
  mocks.checkout.mockResolvedValue(Response.json({ message: "error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/app.ts\nPlease commit your changes or stash them before you switch branches.\nAborting" }, { status: 409 }));
  expect((await checkout()).body.message).toContain("src/app.ts");
});

it("reports an absent repository during the branch preflight without attempting checkout", async () => {
  mocks.branches.mockResolvedValue(Response.json({ error: "repository does not exist" }, { status: 500 }));
  const result = await checkout();
  expect(result.response.status).toBe(409);
  expect(result.body.code).toBe("WORKSPACE_REPOSITORY_MISSING");
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("preserves untracked paths and redacts the server credential even inside a recognized Git error", async () => {
  mocks.checkout.mockResolvedValue(new Response("error: The following untracked working tree files would be overwritten by checkout:\n\tnotes.txt\n\ttest-server-key\nPlease move or remove them before you switch branches.", { status: 500 }));
  const result = await checkout();
  expect(result.body.code).toBe("CHECKOUT_UNTRACKED_CONFLICT");
  expect(result.body.message).toContain("notes.txt");
  expect(result.body.message).not.toContain("test-server-key");
});

it("does not expose credentials or internal provider details", async () => {
  mocks.checkout.mockResolvedValue(Response.json({ message: "Authorization: Bearer test-server-key\nprivate-provider-stack" }, { status: 500 }));
  const result = await checkout();
  expect(result.response.status).toBe(502);
  expect(JSON.stringify(result.body)).not.toMatch(/test-server-key|private-provider-stack/);
  expect(result.body.message).toMatch(/refresh/i);
});

it("reports an uncertain outcome without retrying when a checkout response is lost", async () => {
  mocks.checkout.mockImplementation(() => { currentBranch = "feature/voice"; throw new TypeError("fetch failed"); });
  const result = await checkout();
  expect(result.response.status).toBe(502);
  expect(result.body.code).toBe("CHECKOUT_OUTCOME_UNKNOWN");
  expect(result.body.message).toMatch(/may already|might have/i);
  expect(mocks.checkout).toHaveBeenCalledOnce();
});

it("does not report success if the post-checkout branch is different", async () => {
  mocks.checkout.mockResolvedValue(new Response(null, { status: 204 }));
  const result = await checkout();
  expect(result.response.status).toBe(409);
  expect(result.body.code).toBe("CHECKOUT_NOT_CONFIRMED");
  expect(result.body.message).toMatch(/refresh/i);
});

it("reports an uncertain outcome if verification fails after checkout", async () => {
  mocks.branches.mockResolvedValueOnce({ branches: ["main", "feature/voice"], current: "main" }).mockResolvedValueOnce({ invalid: true });
  const result = await checkout();
  expect(result.response.status).toBe(502);
  expect(result.body.code).toBe("CHECKOUT_OUTCOME_UNKNOWN");
  expect(currentBranch).toBe("feature/voice");
});

it("rejects malformed branch data before mutation", async () => {
  mocks.branches.mockResolvedValue({ branches: "main", current: "main" });
  expect((await checkout()).response.status).toBe(502);
  expect(mocks.checkout).not.toHaveBeenCalled();
});
