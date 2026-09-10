import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PGlite } from "@electric-sql/pglite";

import { GET } from "@/app/api/projects+api";
import { GET as getProject } from "@/app/api/projects/[projectId]+api";
import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";
import {
  confirmUserProjectOwnership,
  readUserProjectsDb,
} from "@/features/projects/server/projects";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logQuery: vi.fn(),
  pg: undefined as unknown as PGlite,
}));
vi.mock("@/db/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  mocks.pg = await PGlite.create();
  return { db: drizzle(mocks.pg, { logger: { logQuery: mocks.logQuery } }) };
});
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => undefined }));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
}));
vi.mock("@/services/github/server/access", () => ({
  getGitHubAccessToken: vi.fn(),
  getGitHubErrorResponse: vi.fn(),
}));
vi.mock("@/services/github/server/repositories", () => ({
  verifyGitHubRepositoryAccess: vi.fn(),
}));

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const owner = id(100);
const request = (params: Record<string, string> = {}) =>
  new Request(
    `https://codaloud.test/api/projects?${new URLSearchParams(params)}`,
  );
const insert = (
  value: number,
  name: string,
  timestamp: string,
  userId = owner,
) =>
  mocks.pg.query(
    `insert into projects (id, user_id, name, created_at, updated_at)
    values ($1, $2, $3, $4, $4)`,
    [id(value), userId, name, timestamp],
  );

beforeAll(async () => {
  await mocks.pg.exec("create table project_operations (id uuid primary key, project_id uuid, user_id uuid, kind text)");
  await mocks.pg.exec(`create table projects (
    id uuid primary key, user_id uuid not null, name text not null,
    sandbox_id text, setup_status text not null default 'pending', setup_error text,
    github_repository_id text, last_opened_file_path text, last_opened_at timestamptz,
    created_at timestamptz not null, updated_at timestamptz not null
  )`);
});
afterAll(async () => {
  await mocks.pg.close();
});
beforeEach(async () => {
  await mocks.pg.exec("truncate projects, project_operations");
  mocks.getCurrentUser.mockReset().mockResolvedValue({ userId: owner });
  mocks.logQuery.mockReset();
});

const seed = async () => {
  await insert(1, "Beta", "2026-09-07T12:00:00.123001Z");
  await insert(2, "Beta", "2026-09-07T12:00:00.123001Z");
  await insert(3, "Alpha", "2026-09-07T12:00:00.123002Z");
  await insert(4, "Zulu", "2026-09-07T12:00:00.123999Z");
  await insert(5, "Alpha", "2026-09-07T12:00:00.124001Z");
  await insert(6, "Other owner", "2026-09-07T12:00:00.124001Z", id(200));
};

describe("single project lookup", () => {
  const projectRequest = (projectId: string) =>
    new Request(`https://codaloud.test/api/projects/${projectId}`);

  it("keeps a deleting project in the list but prevents opening it", async () => {
    await seed();
    await mocks.pg.query("insert into project_operations values ($1, $2, $3, 'delete')", [id(300), id(1), owner]);
    const response = await GET(request());
    const body = await response.json();
    expect(body.data.projects.find((project: { id: string }) => project.id === id(1))).toMatchObject({ deletionRequested: true });
    expect(body.data.projects.find((project: { id: string }) => project.id === id(2))).toMatchObject({ deletionRequested: false });
    expect((await getProject(projectRequest(id(1)), { projectId: id(1) })).status).toBe(409);
  });

  it("returns the complete project only when the user owns it", async () => {
    await seed();
    const existingProject = await confirmUserProjectOwnership(owner, id(1));
    expect(existingProject).toMatchObject({
      id: id(1),
      userId: owner,
      name: "Beta",
    });
    expect(existingProject?.createdAt).toBeInstanceOf(Date);
    expect(existingProject).toHaveProperty("githubRepositoryId", null);
    expect(await confirmUserProjectOwnership(owner, id(6))).toBeNull();
    expect(await confirmUserProjectOwnership(owner, id(99))).toBeNull();
  });

  it("returns the owned project in the standard private API response", async () => {
    await seed();
    const req = projectRequest(id(1));
    const response = await getProject(req, { projectId: id(1) });
    expect(mocks.getCurrentUser).toHaveBeenCalledWith(req.headers);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      error: false,
      message: "Project loaded successfully.",
      data: {
        id: id(1),
        userId: owner,
        name: "Beta",
        createdAt: expect.any(String),
      },
    });
  });

  it.each([6, 99])(
    "returns 404 for unowned or missing project %s",
    async (value) => {
      await seed();
      const response = await getProject(projectRequest(id(value)), {
        projectId: id(value),
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: true,
        message: "Project not found.",
      });
    },
  );

  it("authenticates before validating the ID or querying", async () => {
    mocks.getCurrentUser.mockResolvedValue({ userId: null });
    const response = await getProject(projectRequest("invalid"), {
      projectId: "invalid",
    });
    expect(response.status).toBe(401);
    expect(mocks.logQuery).not.toHaveBeenCalled();
  });

  it.each(["invalid", ""])(
    "rejects invalid project ID %s before querying",
    async (projectId) => {
      const response = await getProject(projectRequest(projectId), {
        projectId,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: true,
        message: "Invalid project ID.",
      });
      expect(mocks.logQuery).not.toHaveBeenCalled();
    },
  );

  it.each(["authentication", "database"])(
    "handles %s errors without exposing details",
    async (source) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      if (source === "authentication") {
        mocks.getCurrentUser.mockRejectedValueOnce(
          new Error("Internal details"),
        );
      } else {
        mocks.logQuery.mockImplementationOnce(() => {
          throw new Error("Internal details");
        });
      }
      const response = await getProject(projectRequest(id(1)), {
        projectId: id(1),
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: true,
        message: "Unable to load project. Please try again.",
      });
    },
  );
});

const collect = async (filters: Partial<ProjectParamsSchema>) => {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const page = await readUserProjectsDb(owner, { ...filters, cursor });
    ids.push(...page.projects.map((project) => project.id));
    cursor = page.nextCursor;
    if (cursor === null) return ids;
  }
  throw new Error("Pagination did not terminate");
};

describe("project cursor pagination", () => {
  it("defaults to the first page without a numeric offset", async () => {
    expect(projectParamsSchema.parse({})).toEqual({
      search: "",
      sortBy: "updatedAt",
      sortOrder: "desc",
      pageSize: 20,
    });
    expect(projectParamsSchema.parse({ pageSize: "5" }).pageSize).toBe(5);
    expect(await readUserProjectsDb(owner)).toEqual({
      projects: [],
      nextCursor: null,
    });
    const [sql, params] = mocks.logQuery.mock.calls[0];
    expect(sql).not.toContain("offset");
    expect(params).toEqual(["delete", owner, 21]);
  });

  it.each([
    ["name", "asc", [3, 5, 1, 2, 4]],
    ["name", "desc", [4, 1, 2, 3, 5]],
    ["createdAt", "asc", [1, 2, 3, 4, 5]],
    ["createdAt", "desc", [5, 4, 3, 1, 2]],
    ["updatedAt", "asc", [1, 2, 3, 4, 5]],
    ["updatedAt", "desc", [5, 4, 3, 1, 2]],
  ] as const)(
    "traverses %s %s including ties and sub-millisecond timestamps",
    async (sortBy, sortOrder, expected) => {
      await seed();
      expect(await collect({ sortBy, sortOrder, pageSize: 1 })).toEqual(
        expected.map(id),
      );
      expect(await collect({ sortBy, sortOrder, pageSize: 2 })).toEqual(
        expected.map(id),
      );
    },
  );

  it("ends on a full final page without an extra empty request", async () => {
    await insert(1, "One", "2026-09-07T12:00:00Z");
    await insert(2, "Two", "2026-09-07T12:00:00Z");
    const page = await readUserProjectsDb(owner, { pageSize: 2 });
    expect(page.projects).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
    expect(page.projects[0]).not.toHaveProperty("cursorValue");
  });

  it("keeps the boundary timestamp at database precision", async () => {
    await seed();
    const first = await readUserProjectsDb(owner, { pageSize: 2 });
    expect(JSON.parse(first.nextCursor!).value).toBe(
      "2026-09-07T12:00:00.123999Z",
    );
  });

  it.each(["delete", "update"])(
    "continues after the boundary project is changed by %s",
    async (change) => {
      await seed();
      const first = await readUserProjectsDb(owner, { pageSize: 2 });
      if (change === "delete") {
        await mocks.pg.query("delete from projects where id = $1", [id(4)]);
      } else {
        await mocks.pg.query(
          "update projects set updated_at = '2026-09-08T12:00:00Z' where id = $1",
          [id(4)],
        );
      }
      const second = await readUserProjectsDb(owner, {
        pageSize: 2,
        cursor: first.nextCursor,
      });
      expect(second.projects.map((project) => project.id)).toEqual([
        id(3),
        id(1),
      ]);
    },
  );

  it("does not shift the next page after inserts and deletes before the boundary", async () => {
    await seed();
    const first = await readUserProjectsDb(owner, { pageSize: 2 });
    await mocks.pg.query("delete from projects where id = $1", [id(5)]);
    await insert(7, "New", "2026-09-08T12:00:00Z");
    await insert(8, "Newer", "2026-09-09T12:00:00Z");
    const second = await readUserProjectsDb(owner, {
      pageSize: 2,
      cursor: first.nextCursor,
    });
    expect(second.projects.map((project) => project.id)).toEqual([
      id(3),
      id(1),
    ]);
  });

  it("keeps literal search and ownership restrictions on every page", async () => {
    await insert(1, "50%_\\done α", "2026-09-07T12:00:00Z");
    await insert(2, "50%_\\done β", "2026-09-07T12:00:00Z");
    await insert(3, "50xx done", "2026-09-07T12:00:00Z");
    await insert(4, "50%_\\done γ", "2026-09-07T12:00:00Z", id(200));
    expect(
      await collect({
        search: "  50%_\\done  ",
        sortBy: "name",
        sortOrder: "asc",
        pageSize: 1,
      }),
    ).toEqual([id(1), id(2)]);
  });

  it("rejects cursors reused with a different search or sort before querying", async () => {
    await seed();
    const first = await readUserProjectsDb(owner, { pageSize: 1 });
    const changedFilters: Record<string, string>[] = [
      { search: "other" },
      { sortBy: "name" },
      { sortOrder: "asc" },
    ];
    for (const filters of changedFilters) {
      mocks.logQuery.mockClear();
      const response = await GET(
        request({ ...filters, cursor: first.nextCursor! }),
      );
      expect(response.status).toBe(400);
      expect(mocks.logQuery).not.toHaveBeenCalled();
    }
  });

  it("returns a bounded, private API page and accepts its continuation", async () => {
    await seed();
    const response = await GET(request({ pageSize: "2" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const first = await response.json();
    expect(
      first.data.projects.map((project: { id: string }) => project.id),
    ).toEqual([id(5), id(4)]);
    expect(first.data.projects[0].updatedAt).toEqual(expect.any(String));
    const next = await GET(
      request({ pageSize: "2", cursor: first.data.nextCursor }),
    );
    expect(
      (await next.json()).data.projects.map(
        (project: { id: string }) => project.id,
      ),
    ).toEqual([id(3), id(1)]);
  });

  it("authenticates before validating or querying", async () => {
    mocks.getCurrentUser.mockResolvedValue({ userId: null });
    const req = request({ cursor: "invalid" });
    expect((await GET(req)).status).toBe(401);
    expect(mocks.getCurrentUser).toHaveBeenCalledWith(req.headers);
    expect(mocks.logQuery).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    { page: "1" },
    { page: "2" },
    { pageSize: "0" },
    { pageSize: "101" },
    { pageSize: "1.5" },
    { pageSize: "" },
    { search: "x".repeat(201) },
    { sortBy: "userId" },
    { sortOrder: "desc; select 1" },
    { userId: id(200) },
    { cursor: "" },
    { cursor: "not-json" },
    { cursor: "{}" },
    { cursor: "null" },
    { cursor: "x".repeat(4097) },
    ...[
      { version: 2 },
      { id: "not-a-uuid" },
      { value: "invalid timestamp" },
      { unexpected: true },
    ].map((fields) => ({
      cursor: JSON.stringify({
        version: 1,
        id: id(1),
        value: "2026-09-07T12:00:00Z",
        search: "",
        sortBy: "updatedAt",
        sortOrder: "desc",
        ...fields,
      }),
    })),
  ])("rejects invalid params before querying: %j", async (params) => {
    const response = await GET(request(params));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: true,
      message: expect.any(String),
    });
    expect(mocks.logQuery).not.toHaveBeenCalled();
  });

  it("validates direct database options before querying", async () => {
    await expect(
      readUserProjectsDb(owner, { cursor: "invalid" }),
    ).rejects.toThrow();
    expect(mocks.logQuery).not.toHaveBeenCalled();
  });

  it("keeps database errors out of the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(mocks.pg, "query").mockRejectedValueOnce(
      new Error("private database details"),
    );
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: true,
      message: "Unable to load projects. Please try again.",
    });
  });
});
