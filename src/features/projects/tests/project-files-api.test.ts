import { beforeEach, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH, POST } from "@/app/api/projects/[projectId]/files+api";
import { SandboxFilesError } from "@/services/daytona/api";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), read: vi.fn(), search: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/services/daytona/filesystem", () => ({ readSandboxFiles: mocks.read, createSandboxFile: mocks.create, updateSandboxFile: mocks.update, deleteSandboxFile: mocks.delete }));
vi.mock("@/services/daytona/file-search", () => ({ searchSandboxFiles: mocks.search }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));
const projectId = "abcdef00-0000-4000-8000-000000000001";
const userId = "abcdef00-0000-4000-8000-000000000002";
const params = { projectId };
const project = { id: projectId, sandboxId: "sandbox-id", setupStatus: "ready", deletionRequested: false, githubRepositoryId: null };
const input = { parentPath: "notes", name: "hello.txt", kind: "file" };
const request = (body = input) => new Request("https://codaloud.test/api/files", {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: "session=valid" }, body: JSON.stringify(body),
});

const searchRequest = (query = "search=needle") => new Request(`https://codaloud.test/api/files?${query}`);
const searchCursor = "12345678-1234-4123-8123-123456789abc:10:" + "a".repeat(64);

it("routes search through the owned workspace with default scope and ten-file pages", async () => {
  const request = searchRequest();
  const response = await GET(request, params);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.project).toHaveBeenCalledWith(userId, projectId);
  expect(mocks.search).toHaveBeenCalledWith(
    { projectId, sandboxId: "sandbox-id", allowInitialize: true }, userId,
    { search: "needle", scope: "all", path: "", pageSize: 10 }, request.signal,
  );
  expect(mocks.read).not.toHaveBeenCalled();
  expect((await response.json()).data).toMatchObject({ files: [], nextCursor: null, totalCount: 0 });
});

it("passes search scope, folder and cursor together and preserves the page envelope", async () => {
  mocks.search.mockResolvedValue({ files: [{ path: "src/test.ts", titleMatches: false, contentMatchCount: 150, contentSearched: true }],
    nextCursor: searchCursor, totalCount: 20, skippedContentFiles: 0,
    searchedAt: "2026-09-13T00:00:00.000Z", expiresAt: "2026-09-13T00:02:00.000Z" });
  const query = new URLSearchParams({ search: "literal [x]", scope: "content", path: "src", pageSize: "5", cursor: searchCursor });
  const response = await GET(searchRequest(query.toString()), params);
  expect(mocks.search.mock.calls[0][2]).toEqual({ search: "literal [x]", scope: "content", path: "src", pageSize: 5, cursor: searchCursor });
  expect((await response.json()).data).toMatchObject({ nextCursor: searchCursor, totalCount: 20, files: [{ contentMatchCount: 150 }] });
});

it("rejects invalid or ambiguous search parameters without provider work", async () => {
  for (const query of ["search=", "search=%20", "search=x&scope=invalid", "search=x&pageSize=0", "search=x&pageSize=101",
    "search=x&pageSize=1.5", "search=x&cursor=bad", "search=x&path=../outside", "search=x&search=y", "cursor=bad", "scope=content", "pageSize=10"]) {
    const response = await GET(searchRequest(query), params);
    expect(response.status, query).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});

it("enforces authentication and ownership for every search page", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await GET(searchRequest(), params)).status).toBe(401);
  expect(mocks.project).not.toHaveBeenCalled();
  mocks.user.mockResolvedValue({ userId });
  for (const [value, status] of [[null, 404], [{ ...project, deletionRequested: true }, 409], [{ ...project, setupStatus: "pending" }, 409]] as const) {
    mocks.project.mockResolvedValue(value);
    expect((await GET(searchRequest("search=x&cursor=" + searchCursor), params)).status).toBe(status);
  }
  expect(mocks.search).not.toHaveBeenCalled();
});

it("returns actionable search session failures without caching them", async () => {
  for (const [status, code] of [[410, "SEARCH_SESSION_EXPIRED"], [409, "SEARCH_WORKSPACE_CHANGED"], [413, "SEARCH_LIMIT_EXCEEDED"]] as const) {
    mocks.search.mockRejectedValue(new SandboxFilesError(status, code, "Restart the search."));
    const response = await GET(searchRequest(), params);
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).code).toBe(code);
  }
});

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId });
  mocks.project.mockReset().mockResolvedValue(project);
  mocks.read.mockReset().mockResolvedValue([]);
  mocks.search.mockReset().mockResolvedValue({ files: [], nextCursor: null, totalCount: 0, skippedContentFiles: 0,
    searchedAt: "2026-09-13T00:00:00.000Z", expiresAt: "2026-09-13T00:02:00.000Z" });
  mocks.create.mockReset().mockResolvedValue({ name: "hello.txt", path: "notes/hello.txt", isDir: false, size: 0, modifiedAt: "2026-09-10T00:00:00.000Z" });
  mocks.delete.mockReset().mockResolvedValue({ name: "hello.txt", path: "notes/hello.txt", isDir: false, size: 12 });
  mocks.update.mockReset().mockResolvedValue({ name: "hello.txt", path: "notes/hello.txt", isDir: false, size: 12 });
});

const updateInput = { ...input, previousName: "old.txt" };
const updateRequest = (body: unknown = updateInput) => new Request("https://codaloud.test/api/files", {
  method: "PATCH", headers: { "Content-Type": "application/json", Cookie: "session=valid" }, body: JSON.stringify(body),
});

it("authenticates rename and resolves the owned sandbox on the server", async () => {
  const response = await PATCH(updateRequest(), params);
  expect(response.status).toBe(200);
  expect(mocks.user).toHaveBeenCalledWith(expect.any(Headers));
  expect(mocks.project).toHaveBeenCalledWith(userId, projectId);
  expect(mocks.update).toHaveBeenCalledWith({ projectId, sandboxId: "sandbox-id", allowInitialize: true }, updateInput);
  expect((await response.json()).data).toMatchObject({ path: "notes/hello.txt", size: 12 });
});

it("blocks unauthenticated rename before looking up a project", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await PATCH(updateRequest(), params)).status).toBe(401);
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("blocks rename for unowned, deleting, and unprepared projects", async () => {
  for (const [value, status] of [[null, 404], [{ ...project, deletionRequested: true }, 409], [{ ...project, setupStatus: "pending" }, 409], [{ ...project, sandboxId: null }, 409]] as const) {
    mocks.project.mockResolvedValue(value);
    expect((await PATCH(updateRequest(), params)).status).toBe(status);
  }
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects malformed and unsafe rename requests before reaching the workspace", async () => {
  for (const body of [null, { ...updateInput, name: "../escape" }, { ...updateInput, previousName: ".." }, { ...updateInput, parentPath: "/etc" }, { ...updateInput, sandboxId: "other" }]) {
    expect((await PATCH(updateRequest(body), params)).status).toBe(400);
  }
  expect((await PATCH(updateRequest(), { projectId: "invalid" })).status).toBe(400);
  expect((await PATCH(new Request("https://codaloud.test/api/files", { method: "PATCH", body: "{}" }), params)).status).toBe(415);
  expect((await PATCH(new Request("https://codaloud.test/api/files", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{" }), params)).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("uses the existing failure response for conflicts and restoring workspaces", async () => {
  mocks.update.mockRejectedValue(new SandboxFilesError(409, "NAME_CONFLICT", "Choose another name."));
  const conflict = await PATCH(updateRequest(), params);
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toEqual({ error: true, code: "NAME_CONFLICT", message: "Choose another name." });
  mocks.update.mockRejectedValue(new SandboxFilesError(503, "WORKSPACE_RESTORING", "Restoring."));
  const restoring = await PATCH(updateRequest(), params);
  expect(restoring.status).toBe(503);
  expect(restoring.headers.get("Retry-After")).toBe("3");
  expect(restoring.headers.get("Cache-Control")).toBe("private, no-store");
  mocks.update.mockRejectedValue(new Error("private provider detail"));
  const failure = await PATCH(updateRequest(), params);
  expect(failure.status).toBe(502);
  expect(JSON.stringify(await failure.json())).not.toContain("private provider detail");
});

it("authenticates reads, checks ownership, and passes only the owned sandbox to Daytona", async () => {
  const response = await GET(new Request("https://codaloud.test/api/files?path=notes"), params);
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual([]);
  expect(mocks.project).toHaveBeenCalledWith(userId, projectId);
  expect(mocks.read).toHaveBeenCalledWith({ projectId, sandboxId: "sandbox-id", allowInitialize: true }, "notes");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("creates an entry and returns its metadata", async () => {
  const response = await POST(request(), params);
  expect(response.status).toBe(201);
  expect((await response.json()).data.path).toBe("notes/hello.txt");
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: "sandbox-id" }), input);
});

it.each(["read", "create"])("rejects an unauthenticated %s before touching Daytona", async (operation) => {
  mocks.user.mockResolvedValue({ userId: null });
  const response = await (operation === "read" ? GET(request(), params) : POST(request(), params));
  expect(response.status).toBe(401);
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("hides other users' projects and blocks deletion in progress", async () => {
  mocks.project.mockResolvedValue(null);
  expect((await POST(request(), params)).status).toBe(404);
  mocks.project.mockResolvedValue({ ...project, deletionRequested: true });
  expect((await POST(request(), params)).status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled();
});

it.each(["..", "/etc", "notes/../other", "notes\\other"])("rejects unsafe parent %s", async (parentPath) => {
  expect((await POST(request({ ...input, parentPath }), params)).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects an injected sandbox ID and malformed JSON", async () => {
  expect((await POST(request({ ...input, sandboxId: "other" } as typeof input), params)).status).toBe(400);
  const malformed = new Request("https://codaloud.test/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  expect((await POST(malformed, params)).status).toBe(400);
});

const deleteInput = input;
const deleteRequest = (body: unknown = deleteInput) => new Request("https://codaloud.test/api/files", {
  method: "DELETE", headers: { "Content-Type": "application/json", Cookie: "session=valid" }, body: JSON.stringify(body),
});

it("authenticates deletion and resolves the owned sandbox on the server", async () => {
  const response = await DELETE(deleteRequest(), params);
  expect(response.status).toBe(200);
  expect(mocks.user).toHaveBeenCalledWith(expect.any(Headers));
  expect(mocks.project).toHaveBeenCalledWith(userId, projectId);
  expect(mocks.delete).toHaveBeenCalledWith({ projectId, sandboxId: "sandbox-id", allowInitialize: true }, deleteInput);
  expect((await response.json()).data).toMatchObject({ path: "notes/hello.txt", size: 12 });
});

it("blocks unauthenticated deletion before looking up a project", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await DELETE(deleteRequest(), params)).status).toBe(401);
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
});

it("blocks deletion for unowned, deleting, and unprepared projects", async () => {
  for (const [value, status] of [[null, 404], [{ ...project, deletionRequested: true }, 409], [{ ...project, setupStatus: "pending" }, 409], [{ ...project, sandboxId: null }, 409]] as const) {
    mocks.project.mockResolvedValue(value);
    expect((await DELETE(deleteRequest(), params)).status).toBe(status);
  }
  expect(mocks.delete).not.toHaveBeenCalled();
});

it("rejects malformed and unsafe deletion requests before reaching the workspace", async () => {
  for (const body of [null, { ...deleteInput, name: "../escape" }, { ...deleteInput, name: ".." }, { ...deleteInput, parentPath: "/etc" }, { ...deleteInput, sandboxId: "other" }]) {
    expect((await DELETE(deleteRequest(body), params)).status).toBe(400);
  }
  expect((await DELETE(deleteRequest(), { projectId: "invalid" })).status).toBe(400);
  expect((await DELETE(new Request("https://codaloud.test/api/files", { method: "DELETE", body: "{}" }), params)).status).toBe(415);
  expect((await DELETE(new Request("https://codaloud.test/api/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{" }), params)).status).toBe(400);
  expect(mocks.delete).not.toHaveBeenCalled();
});

it("uses the existing failure response for changed deletion targets and restoring workspaces", async () => {
  mocks.delete.mockRejectedValue(new SandboxFilesError(409, "FILE_CHANGED", "Refresh the folder."));
  const conflict = await DELETE(deleteRequest(), params);
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toEqual({ error: true, code: "FILE_CHANGED", message: "Refresh the folder." });
  mocks.delete.mockRejectedValue(new SandboxFilesError(503, "WORKSPACE_RESTORING", "Restoring."));
  const restoring = await DELETE(deleteRequest(), params);
  expect(restoring.status).toBe(503);
  expect(restoring.headers.get("Retry-After")).toBe("3");
  expect(restoring.headers.get("Cache-Control")).toBe("private, no-store");
  mocks.delete.mockRejectedValue(new Error("private provider detail"));
  const failure = await DELETE(deleteRequest(), params);
  expect(failure.status).toBe(502);
  expect(JSON.stringify(await failure.json())).not.toContain("private provider detail");
});
