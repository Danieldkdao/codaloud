import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/projects/[projectId]/files+api";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), read: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/services/daytona/filesystem", () => ({ readSandboxFiles: mocks.read, createSandboxFile: mocks.create }));
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
