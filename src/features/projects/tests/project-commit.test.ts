import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { commitUserProject } from "../server/project-commit";
import type { ProjectRepositoryChangeSchema, ProjectRepositoryChangesSchema } from "../actions/change-schemas";

vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), stage: vi.fn(), commit: vi.fn() }));
vi.mock("@/services/daytona/commit-changes", () => ({ commitSandboxChanges: mocks.commit }));
vi.mock("@/services/daytona/stage-changes", () => ({ stageSandboxChanges: mocks.stage }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));

const projectId = "11111111-1111-4111-8111-111111111111";
const headers = new Headers({ cookie: "session=test" });
const network = vi.fn<typeof fetch>();
const change = (path: string, fields: Partial<ProjectRepositoryChangeSchema> = {}): ProjectRepositoryChangeSchema => ({
  path, originalPath: null, indexStatus: "unchanged", worktreeStatus: "modified",
  isUntracked: false, isConflicted: false, kind: "file",
  headMode: "100644", indexMode: "100644", worktreeMode: "100644",
  staged: null, unstaged: { patch: "", additions: 1, deletions: 1, unavailableReason: null },
  ...fields,
});
let snapshot: ProjectRepositoryChangesSchema;
let labels: Record<string, string>;

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  mocks.stage.mockReset().mockImplementation(async (_headers, _projectId, selection) => ({
    stagedPaths: selection.paths, currentBranch: selection.currentBranch, headSha: selection.headSha, indexFingerprint: "b".repeat(64),
  }));
  mocks.commit.mockReset().mockImplementation(async (_headers, _projectId, staged) => ({ hash: "c".repeat(40), currentBranch: staged.currentBranch, parentHash: staged.headSha }));
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.project.mockReset().mockResolvedValue({
    id: projectId, sandboxId: "sandbox", setupStatus: "ready", deletionRequested: false,
    githubRepositoryId: null,
  });
  snapshot = {
    repositoryState: "ready", currentBranch: "feature/current", headSha: "a".repeat(40),
    isDetached: false, observedAt: "2026-09-14T12:00:00Z", changes: [change("file.txt")],
  };
  labels = { codaloudApp: "codaloud", codaloudProjectId: projectId };
  network.mockReset().mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/sandbox/sandbox") {
      return Response.json({ id: "sandbox", state: "started", labels, toolboxProxyUrl: "https://toolbox.test" });
    }
    if (url.pathname.endsWith("/user-home-dir")) return Response.json({ dir: "/home/daytona" });
    if (url.pathname.endsWith("/process/execute")) return Response.json({ exitCode: 0, result: JSON.stringify(snapshot) });
    throw new Error(`Unexpected endpoint: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", network);
});

it("returns only the requested changes in order, scoped to the actual checkout", async () => {
  snapshot.changes.push(change("new.txt", { isUntracked: true, worktreeStatus: "untracked" }), change("other.txt"));
  const result = await commitUserProject(headers, projectId, { message: " Update files ", paths: ["new.txt", "file.txt"] });
  expect(result).toEqual({
    hash: "c".repeat(40), currentBranch: "feature/current", parentHash: snapshot.headSha,
  });
  expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(headers, projectId, {
    stagedPaths: ["new.txt", "file.txt"], currentBranch: "feature/current", headSha: snapshot.headSha, indexFingerprint: "b".repeat(64),
  }, "Update files", undefined);
  expect(mocks.stage.mock.invocationCallOrder[0]).toBeLessThan(mocks.commit.mock.invocationCallOrder[0]);
  expect(mocks.user).toHaveBeenCalledExactlyOnceWith(headers);
  expect(mocks.project).toHaveBeenCalledExactlyOnceWith("owner", projectId);
  expect(mocks.stage).toHaveBeenCalledExactlyOnceWith(headers, projectId, {
    paths: ["new.txt", "file.txt"], currentBranch: "feature/current", headSha: snapshot.headSha,
  }, undefined);
  expect(network.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    "/api/sandbox/sandbox", "/sandbox/user-home-dir", "/sandbox/process/execute",
  ]);
});

it("rejects an unauthenticated caller before looking up the project or contacting Daytona", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] }))
    .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  expect(mocks.project).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  expect(mocks.stage).not.toHaveBeenCalled();
});

it("rejects an unowned project before contacting Daytona", async () => {
  mocks.project.mockResolvedValue(null);
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] }))
    .rejects.toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" });
  expect(network).not.toHaveBeenCalled();
});

it("rejects a sandbox belonging to another project before executing commands", async () => {
  labels.codaloudProjectId = "another-project";
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] }))
    .rejects.toMatchObject({ status: 409, code: "SANDBOX_MISMATCH" });
  expect(network).toHaveBeenCalledTimes(1);
});

it.each([[], ["file.txt", "missing.txt"], ["file.txt", "unchanged.txt"], ["."]].map((paths) => ({ paths })))(
  "rejects the whole invalid selection without returning a partial result: $paths", async ({ paths }) => {
    await expect(commitUserProject(headers, projectId, { message: "Update", paths }))
      .rejects.toMatchObject({ code: paths.length === 0 || paths[0] === "." ? "INVALID_COMMIT_INPUT" : "COMMIT_SELECTION_CHANGED" });
  },
);

it("matches paths literally, without accepting directories or expanding wildcards", async () => {
  snapshot.changes = [change("src/file.txt"), change("*.txt"), change(" spaced\nname.txt ")];
  const paths = ["*.txt", " spaced\nname.txt "];
  await commitUserProject(headers, projectId, { message: "Update", paths });
  expect(mocks.stage).toHaveBeenCalledWith(headers, projectId, expect.objectContaining({ paths }), undefined);
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["src"] }))
    .rejects.toMatchObject({ code: "COMMIT_SELECTION_CHANGED" });
});

it("accepts Git-reported deletions and preserves rename source paths", async () => {
  snapshot.changes = [
    change("removed.txt", { worktreeStatus: "deleted", worktreeMode: "000000" }),
    change("new-name.txt", { originalPath: "old-name.txt", indexStatus: "renamed", worktreeStatus: "unchanged" }),
  ];
  const result = await commitUserProject(headers, projectId, { message: "Rename and delete", paths: ["removed.txt", "new-name.txt"] });
  expect(result.hash).toBe("c".repeat(40));
  expect(mocks.stage).toHaveBeenCalledWith(headers, projectId, {
    paths: ["removed.txt", "new-name.txt", "old-name.txt"], currentBranch: "feature/current", headSha: snapshot.headSha,
  }, undefined);
  await expect(commitUserProject(headers, projectId, { message: "Rename", paths: ["old-name.txt"] }))
    .rejects.toMatchObject({ code: "COMMIT_SELECTION_CHANGED" });
});

it("allows the first commit on an unborn branch without GitHub", async () => {
  snapshot.repositoryState = "unborn";
  snapshot.headSha = null;
  snapshot.changes = [change("new.txt", { isUntracked: true, worktreeStatus: "untracked" })];
  expect(await commitUserProject(headers, projectId, { message: "Initial commit", paths: ["new.txt"] }))
    .toMatchObject({ currentBranch: "feature/current", parentHash: null });
});

it.each(["detached", "not-initialized"])("rejects a %s checkout", async (state) => {
  snapshot.currentBranch = null;
  if (state === "detached") snapshot.isDetached = true;
  else snapshot.repositoryState = "not-initialized";
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] }))
    .rejects.toMatchObject({ status: 409, code: "COMMIT_BRANCH_UNAVAILABLE" });
});

it("rejects unresolved conflicts even in an unselected path", async () => {
  snapshot.changes.push(change("conflict.txt", { isConflicted: true, indexStatus: "unmerged" }));
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] }))
    .rejects.toMatchObject({ status: 409, code: "COMMIT_UNRESOLVED_CONFLICTS" });
});

it.each(["symlink", "submodule"] as const)("rejects a selected %s until its commit semantics are supported", async (kind) => {
  snapshot.changes[0].kind = kind;
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] }))
    .rejects.toMatchObject({ status: 422, code: "COMMIT_UNSUPPORTED_FILE" });
});

it("allows binary and large file changes even when a text preview is unavailable", async () => {
  snapshot.changes[0].unstaged = { patch: null, additions: null, deletions: null, unavailableReason: "binary" };
  expect((await commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] })).hash).toBe("c".repeat(40));
});

it("does not commit when staging fails", async () => {
  mocks.stage.mockRejectedValue(new Error("staging failed"));
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] })).rejects.toThrow("staging failed");
  expect(mocks.commit).not.toHaveBeenCalled();
});

it("sanitizes malformed Daytona output and request failures", async () => {
  snapshot.headSha = "invalid";
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] }))
    .rejects.toMatchObject({ status: 502, code: "CHANGES_UNAVAILABLE" });
  network.mockRejectedValue(new Error("secret provider detail"));
  await expect(commitUserProject(headers, projectId, { message: "Update", paths: ["file.txt"] }))
    .rejects.toMatchObject({ status: 502, code: "DAYTONA_REQUEST_FAILED" });
});
