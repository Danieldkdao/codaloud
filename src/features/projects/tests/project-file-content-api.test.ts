import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/projects/[projectId]/file-content+api";
import { SandboxFilesError } from "@/services/daytona/api";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/services/daytona/filesystem", () => ({ readSandboxFileContent: mocks.read }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));

const projectId = "abcdef00-0000-4000-8000-000000000001";
const userId = "abcdef00-0000-4000-8000-000000000002";
const project = { id: projectId, sandboxId: "owned-sandbox", setupStatus: "ready", deletionRequested: false, githubRepositoryId: null };
const request = (path: string | null = "notes/hello.txt") => new Request(
  `https://codaloud.test/api/projects/${projectId}/file-content?${new URLSearchParams(path === null ? {} : { path })}`,
  { headers: { Cookie: "session=valid" } },
);

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId });
  mocks.project.mockReset().mockResolvedValue(project);
  mocks.read.mockReset().mockResolvedValue({ path: "notes/hello.txt", content: "", size: 0 });
});

it("authenticates, resolves the owned workspace, and returns empty file content as success", async () => {
  const input = request();
  const response = await GET(input, { projectId });
  expect(mocks.user).toHaveBeenCalledWith(input.headers);
  expect(mocks.project).toHaveBeenCalledExactlyOnceWith(userId, projectId);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ projectId, sandboxId: "owned-sandbox", allowInitialize: true }, "notes/hello.txt");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: false, message: "File loaded.", data: { path: "notes/hello.txt", content: "", size: 0 } });
});

it("rejects unauthenticated requests before accessing projects or Daytona", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: true, code: "UNAUTHENTICATED" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});

it("validates the project and file path before looking up the workspace", async () => {
  expect((await GET(request(), { projectId: "invalid" })).status).toBe(400);
  for (const path of [null, "", "/etc/passwd", "../outside", "a/../b", "a//b", "a/", "a\\b", "a\u0000b"]) {
    const response = await GET(request(path), { projectId });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});

it("hides unowned projects and blocks deleting or unprepared workspaces", async () => {
  for (const [value, status] of [[null, 404], [{ ...project, deletionRequested: true }, 409], [{ ...project, setupStatus: "pending" }, 409], [{ ...project, sandboxId: null }, 409]] as const) {
    mocks.project.mockResolvedValue(value);
    expect((await GET(request(), { projectId })).status).toBe(status);
  }
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each([[413, "FILE_TOO_LARGE"], [415, "UNSUPPORTED_FILE_ENCODING"], [404, "FILE_NOT_FOUND"], [409, "FILE_CHANGED"], [400, "INVALID_PATH"]])("preserves the %s %s failure without returning partial contents", async (status, code) => {
  mocks.read.mockRejectedValue(new SandboxFilesError(Number(status), String(code), "File could not be opened."));
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: true, code, message: "File could not be opened." });
});

it("returns restoration retry information and hides unexpected server errors", async () => {
  mocks.read.mockRejectedValue(new SandboxFilesError(503, "WORKSPACE_RESTORING", "Restoring."));
  const restoring = await GET(request(), { projectId });
  expect(restoring.status).toBe(503);
  expect(restoring.headers.get("Retry-After")).toBe("3");
  mocks.user.mockRejectedValue(new Error("private credentials"));
  const failure = await GET(request(), { projectId });
  expect(failure.status).toBe(502);
  expect(failure.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await failure.json()).toEqual({ error: true, message: "Unable to access project files. Please try again." });
});
