import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stageSandboxChanges } from "../stage-changes";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), repository: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/project-workspace", () => ({ getUserReadyProject: mocks.project }));
vi.mock("@/services/daytona/branches", () => ({ getSandboxGitRepository: mocks.repository }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));

const headers = new Headers({ cookie: "session=test" });
const projectId = "11111111-1111-4111-8111-111111111111";
const selection = { paths: ["file.txt"], currentBranch: "main", headSha: "a".repeat(40) };
const result = { stagedPaths: ["file.txt"], currentBranch: "main", headSha: selection.headSha, indexFingerprint: "b".repeat(64) };
const network = vi.fn<typeof fetch>();

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.project.mockReset().mockResolvedValue({ sandboxId: "owned-sandbox" });
  mocks.repository.mockReset().mockResolvedValue({ toolboxUrl: "https://toolbox.test/owned-sandbox", repositoryPath: "/home/daytona/.codaloud/workspace" });
  network.mockReset().mockResolvedValue(Response.json({ exitCode: 0, result: JSON.stringify(result) }));
  vi.stubGlobal("fetch", network);
});
afterEach(() => vi.unstubAllGlobals());

it("resolves the owned workspace and validates confirmed staging without calling commit", async () => {
  expect(await stageSandboxChanges(headers, projectId, selection)).toEqual(result);
  expect(mocks.project).toHaveBeenCalledExactlyOnceWith("owner", projectId);
  expect(mocks.repository).toHaveBeenCalledExactlyOnceWith("owned-sandbox", projectId);
  expect(network).toHaveBeenCalledTimes(1);
  const [url, options] = network.mock.calls[0];
  expect(url).toBe("https://toolbox.test/owned-sandbox/process/execute");
  expect(options?.method).toBe("POST");
  expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer test-key");
});

it("does not stage if the session is gone", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  await expect(stageSandboxChanges(headers, projectId, selection)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(mocks.project).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it.each([
  { ...result, stagedPaths: ["other.txt"] },
  { ...result, stagedPaths: ["file.txt", "file.txt"] },
  { ...result, currentBranch: "other" },
  { ...result, headSha: "b".repeat(40) },
  { ...result, stagedPaths: [] },
  { ...result, indexFingerprint: "invalid" },
])("does not claim success for an inconsistent staging response: %j", async (output) => {
  network.mockResolvedValue(Response.json({ exitCode: 0, result: JSON.stringify(output) }));
  await expect(stageSandboxChanges(headers, projectId, selection)).rejects.toMatchObject({ code: "COMMIT_STAGING_OUTCOME_UNKNOWN" });
  expect(network).toHaveBeenCalledTimes(1);
});

it("reports a lost response as an unknown outcome and does not retry staging", async () => {
  network.mockRejectedValue(new Error("private transport detail"));
  await expect(stageSandboxChanges(headers, projectId, selection)).rejects.toMatchObject({
    status: 502, code: "COMMIT_STAGING_OUTCOME_UNKNOWN",
    message: "Unable to confirm staging. Refresh Git changes before retrying; files may already be staged.",
  });
  expect(network).toHaveBeenCalledTimes(1);
});

it.each([
  ["COMMIT_STAGING_BUSY", 409], ["WORKSPACE_CHANGED", 409],
  ["COMMIT_UNSELECTED_STAGED_CHANGES", 409], ["COMMIT_UNSUPPORTED_FILTER", 422],
  ["COMMIT_STAGING_FAILED", 502],
] as const)("translates a staging command error: %s", async (code, status) => {
  network.mockResolvedValue(Response.json({ exitCode: 1, result: JSON.stringify({ code }) }));
  await expect(stageSandboxChanges(headers, projectId, selection)).rejects.toMatchObject({ status, code });
});
