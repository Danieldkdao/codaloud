import { beforeEach, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/projects/[projectId]/file-content+api";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";
import { SandboxFilesError } from "@/services/daytona/api";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/services/daytona/filesystem", () => ({ readSandboxFileContent: mocks.read, saveSandboxFileContent: mocks.save }));
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
  mocks.save.mockReset().mockResolvedValue({ path: "notes/hello.txt", size: 0, contentHash: "a".repeat(64) });
});

const saveInput = { path: "notes/hello.txt", content: "", expectedContentHash: "b".repeat(64) };
const saveRequest = (body: unknown = saveInput, contentType = "application/json") => new Request(
  `https://codaloud.test/api/projects/${projectId}/file-content`,
  { method: "PUT", headers: { Cookie: "session=valid", "Content-Type": contentType }, body: JSON.stringify(body) },
);

it("saves empty content through the authenticated owned workspace and returns the confirmed hash", async () => {
  const input = saveRequest();
  const response = await PUT(input, { projectId });
  expect(mocks.user).toHaveBeenCalledWith(input.headers);
  expect(mocks.project).toHaveBeenCalledExactlyOnceWith(userId, projectId);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ projectId, sandboxId: "owned-sandbox", allowInitialize: true }, saveInput);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: false, message: "File saved.", data: { path: saveInput.path, size: 0, contentHash: "a".repeat(64) } });
});

it("does not save before authentication, ownership, and workspace readiness succeed", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await PUT(saveRequest(), { projectId })).status).toBe(401);
  expect(mocks.project).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue({ userId });
  expect((await PUT(saveRequest(), { projectId: "invalid" })).status).toBe(400);
  for (const [value, status] of [[null, 404], [{ ...project, deletionRequested: true }, 409], [{ ...project, setupStatus: "pending" }, 409], [{ ...project, sandboxId: null }, 409]] as const) {
    mocks.project.mockResolvedValue(value);
    expect((await PUT(saveRequest(), { projectId })).status).toBe(status);
  }
  expect(mocks.save).not.toHaveBeenCalled();
});

it("rejects malformed or unsafe save requests before workspace access", async () => {
  const malformed = saveRequest();
  vi.spyOn(malformed, "json").mockRejectedValue(new SyntaxError());
  expect((await PUT(malformed, { projectId })).status).toBe(400);
  expect((await PUT(saveRequest(saveInput, "text/plain"), { projectId })).status).toBe(415);
  for (const body of [null, {}, { ...saveInput, sandboxId: "other" }, { ...saveInput, expectedContentHash: undefined },
    ...["../outside", "/etc/passwd", "a//b", "a\\b"].map((path) => ({ ...saveInput, path })),
    ...[null, "\u0000", "\ud800", "é".repeat(MAX_PROJECT_FILE_SIZE_BYTES)].map((content) => ({ ...saveInput, content })),
  ]) {
    const response = await PUT(saveRequest(body), { projectId });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each([[409, "FILE_CHANGED"], [403, "FILESYSTEM_PERMISSION_DENIED"], [404, "FILE_NOT_FOUND"], [502, "DAYTONA_REQUEST_FAILED"], [503, "WORKSPACE_RESTORING"]])("preserves save failure %s %s", async (status, code) => {
  mocks.save.mockRejectedValue(new SandboxFilesError(Number(status), String(code), "Save failed."));
  const response = await PUT(saveRequest(), { projectId });
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: true, message: "Save failed.", code });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  if (code === "WORKSPACE_RESTORING") expect(response.headers.get("Retry-After")).toBe("3");
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
