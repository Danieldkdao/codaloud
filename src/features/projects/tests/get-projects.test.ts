import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/projects+api";
import { projectParamsSchema } from "@/features/projects/lib/project-params";
import { readUserProjectsDb } from "@/features/projects/server/projects";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/db/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => undefined }));
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  Alert: { alert: vi.fn() },
}));
vi.mock("@/services/github/server/access", () => ({
  getGitHubAccessToken: vi.fn(),
  getGitHubErrorResponse: vi.fn(),
}));
vi.mock("@/services/github/server/repositories", () => ({
  verifyGitHubRepositoryAccess: vi.fn(),
}));

const request = (params: Record<string, string> = {}) =>
  new Request(
    `https://codaloud.test/api/projects?${new URLSearchParams(params)}`,
  );

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue({ userId: "current-user" });
  mocks.execute.mockResolvedValue({ rows: [] });
});

describe("project list params and route", () => {
  it("reads a user's projects with omitted options", async () => {
    expect(await readUserProjectsDb("current-user")).toEqual([]);
    expect(mocks.execute.mock.calls[0][1]).toEqual(["current-user", 20]);
    expect(mocks.execute.mock.calls[0][0]).toContain(
      'order by "projects"."updated_at" desc, "projects"."id" asc',
    );
  });

  it("applies defaults to partial options for direct database reads", async () => {
    await readUserProjectsDb("current-user", {
      search: "  My project  ",
      page: 2,
    });
    expect(mocks.execute.mock.calls[0][1]).toEqual([
      "current-user",
      "%My project%",
      20,
      20,
    ]);
  });

  it("validates direct database read options before querying", async () => {
    await expect(
      readUserProjectsDb("current-user", { pageSize: 101 }),
    ).rejects.toThrow();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("shares pagination defaults and parses URL numbers", () => {
    expect(projectParamsSchema.parse({})).toEqual({
      search: "",
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
    });
    expect(
      projectParamsSchema.parse({ page: "3", pageSize: "5" }),
    ).toMatchObject({
      page: 3,
      pageSize: 5,
    });
  });

  it("authenticates before validating or querying", async () => {
    mocks.getCurrentUser.mockResolvedValue({ userId: null });
    const req = request({ page: "invalid" });
    const response = await GET(req);
    expect(mocks.getCurrentUser).toHaveBeenCalledWith(req.headers);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: true });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("uses a bounded, user-owned, deterministic default page", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      error: false,
      message: "Projects loaded successfully.",
      data: [],
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain('"projects"."user_id" = $1');
    expect(sql).toContain(
      'order by "projects"."updated_at" desc, "projects"."id" asc',
    );
    expect(sql).toContain("limit $2");
    expect(params).toEqual(["current-user", 20]);
  });

  it("combines literal name search with ownership and page offset", async () => {
    const response = await GET(
      request({ search: "  50%_\\done  ", page: "3", pageSize: "5" }),
    );
    expect(response.status).toBe(200);
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain(
      'where ("projects"."user_id" = $1 and "projects"."name" ilike $2)',
    );
    expect(sql).toContain("limit $3 offset $4");
    expect(params).toEqual(["current-user", "%50\\%\\_\\\\done%", 5, 10]);
  });

  it.each([
    ["name", "name", "asc"],
    ["name", "name", "desc"],
    ["createdAt", "created_at", "asc"],
    ["createdAt", "created_at", "desc"],
    ["updatedAt", "updated_at", "asc"],
    ["updatedAt", "updated_at", "desc"],
  ])("supports sorting by %s %s %s", async (sortBy, column, sortOrder) => {
    expect((await GET(request({ sortBy, sortOrder }))).status).toBe(200);
    expect(mocks.execute.mock.calls[0][0]).toContain(
      `order by "projects"."${column}" ${sortOrder}, "projects"."id" asc`,
    );
  });

  it.each<Record<string, string>>([
    { page: "0" },
    { page: "-1" },
    { page: "1.5" },
    { page: "abc" },
    { pageSize: "0" },
    { pageSize: "101" },
    { pageSize: "1.5" },
    { pageSize: "" },
    { page: String(Number.MAX_SAFE_INTEGER), pageSize: "100" },
    { search: "x".repeat(201) },
    { sortBy: "userId" },
    { sortOrder: "desc; select 1" },
    { userId: "another-user" },
  ])("rejects invalid params before querying: %j", async (params) => {
    const response = await GET(request(params));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: true,
      message: expect.any(String),
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns an empty array for a page beyond the results", async () => {
    const response = await GET(request({ page: "100", pageSize: "10" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ error: false, data: [] });
    expect(mocks.execute.mock.calls[0][1]).toEqual(["current-user", 10, 990]);
  });

  it("keeps database errors out of the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.execute.mockRejectedValue(new Error("private database details"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: true,
      message: "Unable to load projects. Please try again.",
    });
  });
});
