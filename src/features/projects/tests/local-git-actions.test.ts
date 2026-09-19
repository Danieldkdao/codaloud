import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), project: vi.fn(), identity: vi.fn(), token: vi.fn() }));
vi.mock("@/services/local-workspace/execute", () => ({ executeWorkspace: mocks.execute, LocalWorkspaceError: class extends Error { constructor(readonly code: string, message: string) { super(message); } } }));
vi.mock("../local/access", () => ({ requireLocalProject: mocks.project }));
vi.mock("@/features/settings/git-identity", () => ({ requireGitIdentity: mocks.identity }));
vi.mock("@/services/github/credentials", () => ({ getGitHubAccessToken: mocks.token }));
import { initializeProjectGitAction, readProjectBranchesAction, createProjectCommitAction, fetchProjectGitAction, readProjectCommitsAction } from "../actions/git-actions";
import { LocalWorkspaceError } from "@/services/local-workspace/execute";
const id = "00000000-0000-4000-8000-000000000001";
const sha = "a".repeat(40);
beforeEach(() => { vi.resetAllMocks(); mocks.project.mockResolvedValue({ id }); mocks.identity.mockResolvedValue({ name: "Me", email: "me@example.com" }); });
it("initializes Git in the existing project without identity or GitHub credentials", async () => {
  mocks.execute.mockResolvedValue({ currentBranch: "main", headSha: null, upstream: null, upstreamSha: null, outgoing: null, incoming: null, isShallow: false, observedAt: "2026-09-19T12:00:00Z" });
  expect(await initializeProjectGitAction(id)).toMatchObject({ error: false, data: { currentBranch: "main", headSha: null } });
  expect(mocks.project).toHaveBeenCalledWith(id);
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(id, "git/initialize");
  expect(mocks.identity).not.toHaveBeenCalled();
  expect(mocks.token).not.toHaveBeenCalled();
});
it("surfaces initialization failures and rejects unconfirmed native responses", async () => {
  mocks.execute.mockRejectedValueOnce(new LocalWorkspaceError("INVALID_REPOSITORY", "Invalid local repository."));
  expect(await initializeProjectGitAction(id)).toMatchObject({ error: true, code: "INVALID_REPOSITORY" });
  mocks.execute.mockResolvedValueOnce(true);
  expect(await initializeProjectGitAction(id)).toMatchObject({ error: true, code: "GIT_OUTCOME_UNKNOWN" });
});
it("does not initialize a project that is unavailable locally", async () => {
  mocks.project.mockRejectedValue(new LocalWorkspaceError("PROJECT_NOT_FOUND", "Missing project."));
  expect(await initializeProjectGitAction(id)).toMatchObject({ error: true, code: "PROJECT_NOT_FOUND" });
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("commits with local identity without asking for GitHub credentials", async () => {
  mocks.execute.mockResolvedValue({ hash: sha, currentBranch: "main", parentHash: null });
  expect(await createProjectCommitAction(id, { message: "Initial", paths: ["a.txt"] })).toMatchObject({ error: false });
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.execute).toHaveBeenCalledWith(id, "git/commit", expect.objectContaining({ identity: { name: "Me", email: "me@example.com" } }));
});
it("asks for GitHub credentials before remote operations", async () => {
  mocks.token.mockRejectedValue(new Error("Connect GitHub"));
  expect(await fetchProjectGitAction(id)).toMatchObject({ error: true, code: "GITHUB_RECONNECT_REQUIRED" });
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("paginates and filters local branches with the existing cursor contract", async () => {
  mocks.execute.mockResolvedValue({ branches: ["main", "feature/b", "feature/a"], currentBranch: "main" });
  const first = await readProjectBranchesAction(id, { search: "feature", pageSize: 1 });
  expect(first?.branches).toEqual(["feature/a"]);
  expect((await readProjectBranchesAction(id, { search: "feature", pageSize: 1, cursor: first!.nextCursor }))?.branches).toEqual(["feature/b"]);
});
it("continues a fixed history snapshot without dropping filtered commits", async () => {
  const commits = [0, 1, 2].map((n) => ({ hash: String(n).repeat(40), message: `Match ${n}`, author: "Me", authorEmail: "me@example.com", committedAt: "2026-09-18T12:00:00.000Z", parentHashes: [], isMerge: false }));
  mocks.execute.mockImplementation(async (_id, _operation, args) => ({ commits: commits.slice(args.offset), snapshotSha: sha, nextOffset: null, isShallow: false }));
  const first = await readProjectCommitsAction(id, { source: "local", branch: "main", pageSize: 1 });
  const next = await readProjectCommitsAction(id, { source: "local", branch: "main", pageSize: 1, cursor: first!.nextCursor });
  expect(next?.commits[0].message).toBe("Match 1");
  expect(mocks.execute.mock.calls[1][2]).toMatchObject({ snapshotSha: sha, offset: 1 });
  expect(await readProjectCommitsAction(id, { source: "local", branch: "other", pageSize: 1, cursor: first!.nextCursor })).toBeNull();
});

// Compile-time checks: the project layer derives its payloads from the native contract.
const checkProjectCommands = (execute: typeof import("../local/git").executeProjectGit) => {
  // @ts-expect-error Unknown operations cannot reach the dispatcher.
  void execute(id, { operation: "git/anything" });
  // @ts-expect-error Checkout requires a branch name, not a commit payload.
  void execute(id, { operation: "git/checkout", args: { message: "wrong" } });
  // @ts-expect-error Credentials belong to project dispatch, not the caller.
  void execute(id, { operation: "git/fetch", args: { accessToken: "injected" } });
};
void checkProjectCommands;
