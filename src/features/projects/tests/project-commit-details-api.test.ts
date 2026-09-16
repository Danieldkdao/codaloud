import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/projects/[projectId]/commit/[commitSha]+api";
import { SandboxFilesError } from "@/services/daytona/api";
const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), remote: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/services/daytona/commit-details", () => ({ readSandboxCommitDetails: mocks.read }));
vi.mock("@/services/github/server/commit-details", () => ({ readGitHubCommitDetails: mocks.remote }));
vi.mock("@/data/env/server", () => ({ serverEnv: {} }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
const projectId = "11111111-1111-4111-8111-111111111111";
const commitSha = "a".repeat(40);
const details = { source: "local", commit: { hash: commitSha, message: "Empty commit", author: "Ada", authorEmail: "ada@example.com", committer: "Ada", committerEmail: "ada@example.com", authoredAt: "2026-09-15T12:00:00Z", committedAt: "2026-09-15T12:00:00Z", parentHashes: [], isMerge: false }, baseSha: null, files: [], summary: { fileCount: 0, additions: 0, deletions: 0, unavailableCount: 0 }, githubUrl: null };
const request = (query = "source=local") => new Request(`https://codaloud.test/api/projects/${projectId}/commit/${commitSha}?${query}`, { headers: { Cookie: "session=valid" } });
beforeEach(() => { mocks.user.mockReset().mockResolvedValue({ userId: "owner" }); mocks.read.mockReset().mockResolvedValue(details); mocks.remote.mockReset().mockResolvedValue({ ...details, source: "remote" }); });
it("returns validated commit details and private cache headers", async () => {
  const input = request(); const response = await GET(input, { projectId, commitSha });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ error: false, message: "Commit details loaded.", data: details });
  expect(mocks.read).toHaveBeenCalledWith(input.headers, projectId, commitSha, input.signal);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(response.headers.get("Vary")).toBe("Cookie");
});
it("requires authentication before provider access", async () => {
  mocks.user.mockResolvedValue({ userId: null }); expect((await GET(request(), { projectId, commitSha })).status).toBe(401); expect(mocks.read).not.toHaveBeenCalled();
});
it.each(["", "source=bad", "source=", "source=local&source=remote", "source=local&sandboxId=another", "source=local&commitSha=another"])("rejects invalid or ambiguous query parameters: %s", async query => {
  expect((await GET(request(query), { projectId, commitSha })).status).toBe(400); expect(mocks.read).not.toHaveBeenCalled();
});
it.each([{ projectId: "invalid", commitSha }, { projectId, commitSha: "HEAD" }, { projectId, commitSha: "a".repeat(39) }])("rejects invalid route parameters", async params => {
  expect((await GET(request(), params)).status).toBe(400); expect(mocks.read).not.toHaveBeenCalled();
});
it.each([[404, "COMMIT_NOT_FOUND"], [409, "COMMIT_PARENT_UNAVAILABLE"], [413, "COMMIT_DIFF_TOO_LARGE"], [503, "WORKSPACE_RESTORING"]])("preserves actionable service failure %s", async (status, code) => {
  mocks.read.mockRejectedValue(new SandboxFilesError(Number(status), String(code), "Safe message."));
  const response = await GET(request(), { projectId, commitSha }); expect(response.status).toBe(status);
  expect(response.headers.get("Retry-After")).toBe(code === "WORKSPACE_RESTORING" ? "3" : null);
});
it("validates service output and hides internal errors", async () => {
  mocks.read.mockResolvedValue({ ...details, commit: { ...details.commit, hash: "b".repeat(40) } });
  expect((await GET(request(), { projectId, commitSha })).status).toBe(502);
  mocks.read.mockRejectedValue(new Error("secret credential"));
  const response = await GET(request(), { projectId, commitSha });
  expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain("secret credential");
});

it("dispatches remote requests to the GitHub reader", async () => {
  const input = request("source=remote");
  const response = await GET(input, { projectId, commitSha });
  expect(response.status).toBe(200);
  expect((await response.json()).data.source).toBe("remote");
  expect(mocks.remote).toHaveBeenCalledWith(input.headers, projectId, commitSha, input.signal);
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each([
  { ...details, source: "remote" },
  { ...details, summary: { ...details.summary, fileCount: 1 } },
  { ...details, baseSha: "b".repeat(40) },
])("retains identity and summary validation beyond the response shape", async (result) => {
  mocks.read.mockResolvedValue(result);
  const response = await GET(request(), { projectId, commitSha });
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ code: "COMMIT_DETAILS_UNAVAILABLE" });
  expect(mocks.read).toHaveBeenCalledOnce();
});

it("strips service-only fields from the validated result", async () => {
  mocks.read.mockResolvedValue({ ...details, secret: "hidden" });
  const response = await GET(request(), { projectId, commitSha });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual(details);
});
