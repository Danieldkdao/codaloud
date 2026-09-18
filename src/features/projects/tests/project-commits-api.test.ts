import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/projects/[projectId]/commits+api";
import { CommitHistoryError } from "@/features/projects/server/commit-pagination";
import { SandboxFilesError } from "@/services/daytona/api";
import { createSearchParams } from "@/lib/utils";

const mocks = vi.hoisted(() => ({ user: vi.fn(), local: vi.fn(), remote: vi.fn(), commit: vi.fn() }));
vi.mock("@/features/projects/server/project-commit", () => ({ commitUserProject: mocks.commit }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/services/daytona/commits", () => ({ readSandboxCommits: mocks.local }));
vi.mock("@/services/github/server/commits", () => ({ readGitHubCommits: mocks.remote }));
vi.mock("@/data/env/server", () => ({ serverEnv: {} }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));

const projectId = "abcdef00-0000-4000-8000-000000000001";
const page = {
  commits: [{
    hash: "a".repeat(40), message: "Implement history\n\nDetails", author: "Ada",
    authorEmail: "ada@example.com", committedAt: "2026-09-12T12:00:00Z",
    parentHashes: ["b".repeat(40)], isMerge: false,
  }],
  snapshotSha: "a".repeat(40), nextCursor: "opaque-signed-cursor", isShallow: false,
};
const request = (params: Record<string, string | undefined> = { source: "local", branch: "main" }) =>
  new Request(`https://codaloud.test/api/projects/${projectId}/commits?${createSearchParams(params)}`, {
    headers: { Cookie: "session=valid" },
  });

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "authenticated-user" });
  mocks.local.mockReset().mockResolvedValue(page);
  mocks.remote.mockReset().mockResolvedValue(page);
  mocks.commit.mockReset().mockResolvedValue({ hash: "c".repeat(40), currentBranch: "main", parentHash: "a".repeat(40) });
});

const commitRequest = () => new Request(`https://codaloud.test/api/projects/${projectId}/commits`, {
  method: "POST", headers: { Cookie: "session=valid", "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Update", paths: ["file.txt"] }),
});

it("returns the confirmed commit after validation and staging", async () => {
  const input = commitRequest();
  const response = await POST(input, { projectId });
  expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(input.headers, projectId, { message: "Update", paths: ["file.txt"] }, input.signal);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ error: false, message: "Selected changes committed.", data: {
    hash: "c".repeat(40), currentBranch: "main", parentHash: "a".repeat(40),
  } });
});

it("accepts selections larger than the single-command Git body limit", async () => {
  const paths = Array.from({ length: 2000 }, (_, index) => `src/features/selected-files/changed-file-${index}.ts`);
  const body = JSON.stringify({ message: "Commit selected files", paths });
  expect(Buffer.byteLength(body)).toBeGreaterThan(64 * 1024);
  const input = new Request(commitRequest().url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  expect((await POST(input, { projectId })).status).toBe(200);
  expect(mocks.commit).toHaveBeenCalledWith(input.headers, projectId, { message: "Commit selected files", paths }, input.signal);
});

it("rejects mutation query flags and invalid output without repeating a commit", async () => {
  const input = commitRequest();
  const ambiguous = new Request(`${input.url}?force=true`, input);
  expect((await POST(ambiguous, { projectId })).status).toBe(400);
  expect(mocks.commit).not.toHaveBeenCalled();
  mocks.commit.mockResolvedValue({ hash: "not-a-commit", secret: "hidden" });
  const response = await POST(commitRequest(), { projectId });
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ code: "COMMIT_OUTCOME_UNKNOWN" });
  expect(mocks.commit).toHaveBeenCalledOnce();
});

it.each(["source=local&source=remote&branch=main", "source=local&branch=main&page=2", "source=local&branch=main&projectId=other"])("rejects ambiguous or unsupported history query: %s", async (query) => {
  const response = await GET(new Request(`${request().url.split("?")[0]}?${query}`), { projectId });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "INVALID_COMMIT_PARAMS" });
  expect(mocks.local).not.toHaveBeenCalled();
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("does not validate workspace files when the route session is missing", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await POST(commitRequest(), { projectId })).status).toBe(401);
  expect(mocks.commit).not.toHaveBeenCalled();
});

it.each([[404, "PROJECT_NOT_FOUND"], [409, "COMMIT_SELECTION_CHANGED"], [503, "WORKSPACE_RESTORING"]] as const)(
  "returns commit validation errors to the caller: %s %s", async (status, code) => {
    mocks.commit.mockRejectedValue(new SandboxFilesError(status, code, "Safe validation message."));
    const response = await POST(commitRequest(), { projectId });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: true, code, message: "Safe validation message." });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    if (status === 503) expect(response.headers.get("Retry-After")).toBe("3");
  },
);

it("treats unexpected failures after starting the commit flow as an unknown outcome", async () => {
  mocks.commit.mockRejectedValue(new Error("internal credential"));
  const response = await POST(commitRequest(), { projectId });
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: true, code: "COMMIT_OUTCOME_UNKNOWN" });
});

it.each(["local", "remote"])("dispatches %s with normalized filters, cursor and the original session and signal", async (source) => {
  const input = request({ source, branch: "feature/history", search: " HISTORY ", author: " ADA ", pageSize: "2", cursor: "opaque-signed-cursor" });
  const response = await GET(input, { projectId });
  expect(mocks.user).toHaveBeenCalledExactlyOnceWith(input.headers);
  const selected = source === "local" ? mocks.local : mocks.remote;
  const other = source === "local" ? mocks.remote : mocks.local;
  expect(selected).toHaveBeenCalledExactlyOnceWith(input.headers, projectId, {
    branch: "feature/history", search: "history", author: "ada", pageSize: 2, cursor: "opaque-signed-cursor",
  }, input.signal);
  expect(other).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ error: false, message: "Project commits loaded.", data: page });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
});

it("uses default pagination and accepts an empty history", async () => {
  const empty = { commits: [], snapshotSha: null, nextCursor: null, isShallow: false };
  mocks.local.mockResolvedValue(empty);
  const input = request();
  const response = await GET(input, { projectId });
  expect(mocks.local).toHaveBeenCalledWith(input.headers, projectId, {
    branch: "main", search: "", author: "", pageSize: 20, cursor: undefined,
  }, input.signal);
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(empty);
});

it("retains continuation cursors for empty search pages and shallow history metadata", async () => {
  mocks.local.mockResolvedValue({ ...page, commits: [], isShallow: true });
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({ ...page, commits: [], isShallow: true });
});

it("rejects missing authentication before reading history", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: true, code: "UNAUTHENTICATED" });
  expect(mocks.local).not.toHaveBeenCalled();
  expect(mocks.remote).not.toHaveBeenCalled();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("rejects invalid project IDs before reading history", async () => {
  const response = await GET(request(), { projectId: "invalid" });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: true, code: "INVALID_PROJECT" });
  expect(mocks.local).not.toHaveBeenCalled();
  expect(mocks.remote).not.toHaveBeenCalled();
});

it.each([
  { source: "" }, { source: "github" }, { branch: "" }, { branch: "main..secret" },
  { pageSize: "0" }, { pageSize: "101" }, { pageSize: "1.5" }, { pageSize: "NaN" },
  { pageSize: "" }, { cursor: "" }, { cursor: "a".repeat(4097) },
  { search: "a".repeat(201) }, { author: "a".repeat(201) },
])("rejects invalid parameters before dispatch: %j", async (params) => {
  const response = await GET(request({ source: "local", branch: "main", ...params }), { projectId });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: true, code: "INVALID_COMMIT_PARAMS" });
  expect(mocks.local).not.toHaveBeenCalled();
  expect(mocks.remote).not.toHaveBeenCalled();
});

it.each([{ branch: "main" }, { source: "local" }])("requires both source and branch: %j", async (params) => {
  const response = await GET(request(params), { projectId });
  expect(response.status).toBe(400);
  expect(mocks.local).not.toHaveBeenCalled();
  expect(mocks.remote).not.toHaveBeenCalled();
});

it.each(["local", "remote"])("preserves %s authorization and cursor errors", async (source) => {
  const reader = source === "local" ? mocks.local : mocks.remote;
  for (const [status, code] of [[404, "PROJECT_NOT_FOUND"], [403, "GITHUB_REPO_SCOPE_REQUIRED"], [400, "INVALID_COMMIT_CURSOR"], [409, "HISTORY_SNAPSHOT_UNAVAILABLE"], [429, "GITHUB_RATE_LIMITED"]] as const) {
    reader.mockRejectedValueOnce(new CommitHistoryError(status, code, "Safe service message."));
    const response = await GET(request({ source, branch: "main" }), { projectId });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: true, code, message: "Safe service message." });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
});

it("preserves workspace errors and signals when restoration can be retried", async () => {
  mocks.local.mockRejectedValueOnce(new SandboxFilesError(503, "WORKSPACE_RESTORING", "Restoring your workspace."));
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("3");
  expect(await response.json()).toEqual({ error: true, code: "WORKSPACE_RESTORING", message: "Restoring your workspace." });
});

it.each(["local", "remote"])("rejects malformed %s output without returning partial history or internal details", async (source) => {
  const reader = source === "local" ? mocks.local : mocks.remote;
  reader.mockResolvedValue({ ...page, commits: [{ ...page.commits[0], hash: "invalid" }], internalToken: "never-return-this" });
  const response = await GET(request({ source, branch: "main" }), { projectId });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: true, code: "COMMITS_UNAVAILABLE", message: "Unable to load project commits. Please try again." });
});

it("returns only validated response fields", async () => {
  mocks.local.mockResolvedValue({ ...page, internalToken: "never-return-this", commits: [{ ...page.commits[0], privateField: "never-return-this" }] });
  const response = await GET(request(), { projectId });
  expect((await response.json()).data).toEqual(page);
});

it("sanitizes unexpected reader and session failures", async () => {
  mocks.local.mockRejectedValueOnce(new Error("internal credentials and paths"));
  mocks.user.mockRejectedValueOnce(new Error("internal authentication details"));
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await GET(request(), { projectId });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: true, code: "COMMITS_UNAVAILABLE", message: "Unable to load project commits. Please try again." });
  }
});
