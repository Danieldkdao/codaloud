import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/projects+api";
import { ProjectTable, type ProjectInsertData } from "@/db/schemas/project";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => undefined }));
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Alert: { alert: vi.fn() } }));
vi.mock("@/db/db", () => ({ db: { insert: mocks.insert } }));

const request = (payload: unknown, contentType = "application/json") => new Request(
  "https://codaloud.test/api/projects",
  {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(payload),
  },
);

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue({ userId: "current-user" });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockImplementation((data: ProjectInsertData) => {
    mocks.returning.mockResolvedValue([{ id: "created-project", ...data }]);
    return { returning: mocks.returning };
  });
});

describe("project creation route and insert flow", () => {
  it.each([
    { source: "new", repositoryId: undefined, githubRepositoryId: null },
    { source: "github", repositoryId: "123456789", githubRepositoryId: "123456789" },
  ])("inserts a $source project with the correct repository and session owner", async ({ source, repositoryId, githubRepositoryId }) => {
    const response = await POST(request({ name: " My project ", source, repositoryId }));

    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(ProjectTable);
    expect(mocks.values).toHaveBeenCalledExactlyOnceWith({
      name: "My project", userId: "current-user", githubRepositoryId,
    });
    expect(await response.json()).toEqual({
      error: false,
      message: "Project created successfully.",
      data: { id: "created-project", name: "My project", userId: "current-user", githubRepositoryId },
    });
  });

  it.each([undefined, null, "", "abc", "0", "-1", "1.5", 123])(
    "rejects a GitHub import with invalid repository ID %s before inserting",
    async (repositoryId) => {
      const response = await POST(request({ name: "My project", source: "github", repositoryId }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: true, message: "Select a GitHub repository." });
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "unknown"])("rejects missing or unsupported source %s", async (source) => {
    const response = await POST(request({ name: "My project", source }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: true, message: "Choose how to start your project." });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    { source: "new", repositoryId: "123" },
    { source: "new", userId: "another-user" },
    { source: "github", repositoryId: "123", githubRepositoryId: "456" },
  ])("rejects unexpected fields before inserting: %o", async (fields) => {
    const response = await POST(request({ name: "My project", ...fields }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("requires authentication before inserting", async () => {
    mocks.getCurrentUser.mockResolvedValue({ userId: null });
    const response = await POST(request({ name: "My project", source: "new" }));
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("requires JSON before inserting", async () => {
    const response = await POST(request({ name: "My project", source: "new" }, "text/plain"));
    expect(response.status).toBe(415);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
