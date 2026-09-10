import { beforeEach, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "@/app/api/projects/[projectId]/files+api";
import { SandboxFilesError } from "@/services/daytona/api";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), read: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/services/daytona/filesystem", () => ({ readSandboxFiles: mocks.read, createSandboxFile: mocks.create, updateSandboxFile: mocks.update }));
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

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId });
  mocks.project.mockReset().mockResolvedValue(project);
  mocks.read.mockReset().mockResolvedValue([]);
  mocks.create.mockReset().mockResolvedValue({ name: "hello.txt", path: "notes/hello.txt", isDir: false, size: 0, modifiedAt: "2026-09-10T00:00:00.000Z" });
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
