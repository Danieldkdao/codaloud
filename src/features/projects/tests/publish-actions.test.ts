import { beforeEach, expect, it, vi } from "vitest";
import { publishProjectAction } from "../actions/publish-actions";
import { LocalWorkspaceError } from "@/services/local-workspace/execute";

const mocks = vi.hoisted(() => ({ project: vi.fn(), store: vi.fn(), connect: vi.fn(), execute: vi.fn(), token: vi.fn(), create: vi.fn(), verify: vi.fn() }));
vi.mock("../local/access", () => ({ requireLocalProject: mocks.project, getLocalProjects: mocks.store }));
vi.mock("@/services/github/credentials", () => ({ getGitHubAccessToken: mocks.token }));
vi.mock("@/services/github/server/repositories", () => ({ createGitHubRepository: mocks.create, verifyGitHubRepositoryAccess: mocks.verify }));
vi.mock("@/services/local-workspace/execute", () => ({ executeWorkspace: mocks.execute, LocalWorkspaceError: class extends Error { constructor(readonly code: string, message: string) { super(message); } } }));
const id = "00000000-0000-4000-8000-000000000001";
const input = { name: "mobile", description: "Local work", private: true };
const repository = { id: 42, name: "mobile", fullName: "dev/mobile", private: true, cloneUrl: "https://github.com/dev/mobile.git", htmlUrl: "https://github.com/dev/mobile", permissions: { push: true } };
const counts = { currentBranch: "main", headSha: "a".repeat(40), hasRemote: false, upstream: null, upstreamSha: null, outgoing: null, incoming: null, isShallow: false, observedAt: "2026-09-19T00:00:00Z" };
const pushed = { remoteConnected: true, push: { pushed: true, remoteBranch: "main", remoteSha: counts.headSha, trackingUpdated: true, counts: { ...counts, hasRemote: true } } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project.mockResolvedValue({ id, githubRepositoryId: null });
  mocks.store.mockResolvedValue({ connectGitHub: mocks.connect });
  mocks.connect.mockReturnValue({ id, githubRepositoryId: "42" });
  mocks.token.mockResolvedValue("device-token");
  mocks.create.mockResolvedValue(repository);
  mocks.verify.mockResolvedValue(repository);
  mocks.execute.mockImplementation(async (_id, operation) => operation === "git/counts" ? counts : pushed);
});

it("creates, records, then publishes the captured branch through the native engine", async () => {
  expect(await publishProjectAction(id, input)).toMatchObject({ error: false, data: { ...pushed, repositoryId: "42", warning: null } });
  expect(mocks.create).toHaveBeenCalledWith("device-token", input);
  expect(mocks.connect).toHaveBeenCalledWith(id, "42");
  expect(mocks.execute).toHaveBeenLastCalledWith(id, "git/publish", { url: repository.cloneUrl, expectedBranch: "main", expectedHeadSha: counts.headSha, accessToken: "device-token" });
  expect(mocks.connect.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder.at(-1)!);
});

it.each([{ ...counts, hasRemote: true }, { ...counts, headSha: null }, { ...counts, currentBranch: null }, { ...counts, hasRemote: undefined }])("does not create a remote when the local checkout cannot be published", async (status) => {
  mocks.execute.mockResolvedValue(status);
  expect(await publishProjectAction(id, input)).toMatchObject({ error: true });
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects invalid input before network or native operations", async () => {
  expect(await publishProjectAction(id, { ...input, name: " " })).toMatchObject({ error: true });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("reports disconnection and name collisions without connecting a remote", async () => {
  mocks.token.mockRejectedValueOnce(new Error("Connect GitHub"));
  expect(await publishProjectAction(id, input)).toMatchObject({ error: true, code: "GITHUB_RECONNECT_REQUIRED" });
  mocks.create.mockRejectedValueOnce({ status: 422 });
  expect(await publishProjectAction(id, input)).toMatchObject({ error: true, code: "GITHUB_CREATE_FAILED" });
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(mocks.execute.mock.calls.every(([, operation]) => operation === "git/counts")).toBe(true);
});

it("retains partial success when the initial push fails", async () => {
  mocks.execute.mockImplementation(async (_id, operation) => operation === "git/counts" ? counts : { remoteConnected: true, push: null });
  expect(await publishProjectAction(id, input)).toMatchObject({ error: false, data: { remoteConnected: true, push: null, warning: expect.stringContaining("Push") } });
  expect(mocks.connect).toHaveBeenCalled();
});

it("resumes a recorded repository after attachment fails without creating it twice", async () => {
  mocks.execute.mockImplementationOnce(async () => counts).mockRejectedValueOnce(new LocalWorkspaceError("PUBLISH_CHECKOUT_CHANGED", "Changed branch"));
  expect(await publishProjectAction(id, input)).toMatchObject({ error: true, code: "PUBLISH_INCOMPLETE", message: expect.stringContaining("dev/mobile") });
  mocks.project.mockResolvedValue({ id, githubRepositoryId: "42" });
  expect(await publishProjectAction(id, input)).toMatchObject({ error: false });
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.verify).toHaveBeenCalledWith("device-token", "42");
});

it("does not hide a successful push if saving project metadata fails", async () => {
  mocks.connect.mockImplementation(() => { throw new Error("Disk full"); });
  expect(await publishProjectAction(id, input)).toMatchObject({ error: false, data: { push: { pushed: true }, warning: expect.any(String) } });
});

it("blocks duplicate in-flight publish requests", async () => {
  let finish!: (value: typeof repository) => void;
  mocks.create.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = publishProjectAction(id, input);
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(await publishProjectAction(id, input)).toMatchObject({ error: true, code: "GIT_BUSY" });
  finish(repository);
  await pending;
  expect(mocks.create).toHaveBeenCalledOnce();
});


it("reports GitHub's versioned 451 restriction without retrying or connecting a remote", async () => {
  mocks.create.mockRejectedValueOnce({ status: 451 });
  expect(await publishProjectAction(id, input)).toMatchObject({
    error: true, code: "GITHUB_CREATE_FAILED", message: expect.stringContaining("legal restrictions"),
  });
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(mocks.execute.mock.calls.every(([, operation]) => operation === "git/counts")).toBe(true);
});
