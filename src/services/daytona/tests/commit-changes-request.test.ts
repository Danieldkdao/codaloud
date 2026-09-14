import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { commitSandboxChanges } from "../commit-changes";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), repository: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/project-workspace", () => ({ getUserReadyProject: mocks.project }));
vi.mock("@/services/daytona/branches", () => ({ getSandboxGitRepository: mocks.repository }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));
const headers = new Headers({ cookie: "session=test" });
const projectId = "11111111-1111-4111-8111-111111111111";
const staged = { stagedPaths: ["file.txt"], currentBranch: "main", headSha: "a".repeat(40), indexFingerprint: "b".repeat(64) };
const result = { hash: "c".repeat(40), parentHash: staged.headSha, currentBranch: "main" };
const network = vi.fn<typeof fetch>();
beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "owner", user: { name: "Ada", email: "ada@example.com" } });
  mocks.project.mockReset().mockResolvedValue({ sandboxId: "owned-sandbox" });
  mocks.repository.mockReset().mockResolvedValue({ toolboxUrl: "https://toolbox.test/owned-sandbox", repositoryPath: "/home/daytona/.codaloud/workspace" });
  network.mockReset().mockResolvedValue(Response.json({ exitCode: 0, result: JSON.stringify(result) }));
  vi.stubGlobal("fetch", network);
});
afterEach(() => vi.unstubAllGlobals());

it("returns a confirmed commit from the owned sandbox", async () => {
  expect(await commitSandboxChanges(headers, projectId, staged, "Update")).toEqual(result);
  expect(mocks.project).toHaveBeenCalledExactlyOnceWith("owner", projectId);
  expect(network).toHaveBeenCalledTimes(1);
});
it.each([null, { name: "Ada", email: "" }])("rejects a missing session or unusable author before execution", async (user) => {
  mocks.user.mockResolvedValue({ userId: user ? "owner" : null, user });
  await expect(commitSandboxChanges(headers, projectId, staged, "Update")).rejects.toMatchObject({ code: user ? "COMMIT_AUTHOR_REQUIRED" : "UNAUTHENTICATED" });
  expect(network).not.toHaveBeenCalled();
});
it.each([{ ...result, hash: "invalid" }, { ...result, parentHash: null }, { ...result, currentBranch: "other" }])("rejects inconsistent confirmation: %j", async (output) => {
  network.mockResolvedValue(Response.json({ exitCode: 0, result: JSON.stringify(output) }));
  await expect(commitSandboxChanges(headers, projectId, staged, "Update")).rejects.toMatchObject({ code: "COMMIT_OUTCOME_UNKNOWN" });
});
it("does not retry a lost commit response", async () => {
  network.mockRejectedValue(new Error("private provider detail"));
  await expect(commitSandboxChanges(headers, projectId, staged, "Update")).rejects.toMatchObject({ code: "COMMIT_OUTCOME_UNKNOWN" });
  expect(network).toHaveBeenCalledTimes(1);
});
it("preserves actionable index conflicts", async () => {
  network.mockResolvedValue(Response.json({ exitCode: 1, result: JSON.stringify({ code: "COMMIT_INDEX_CHANGED" }) }));
  await expect(commitSandboxChanges(headers, projectId, staged, "Update")).rejects.toMatchObject({ status: 409, code: "COMMIT_INDEX_CHANGED" });
});
