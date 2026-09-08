import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

import { PATCH } from "@/app/api/projects/[projectId]+api";
import { updateProjectSchema } from "@/features/projects/actions/schemas";

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
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Alert: { alert: vi.fn() } }));

const owner = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const otherProjectId = "00000000-0000-4000-8000-000000000003";
const otherOwner = "00000000-0000-4000-8000-000000000004";
const originalTimestamp = "2026-01-01T00:00:00.000Z";
const request = (payload: unknown, contentType = "application/json") =>
  new Request(`https://codaloud.test/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(payload),
  });

beforeAll(async () => {
  await mocks.pg.exec("create table project_operations (id uuid primary key, project_id uuid, user_id uuid, kind text)");
  await mocks.pg.exec(`create table projects (
    id uuid primary key, user_id uuid not null, name text not null,
    sandbox_id text, setup_status text not null default 'pending', setup_error text,
    github_repository_id text, last_opened_file_path text, last_opened_at timestamptz,
    created_at timestamptz not null, updated_at timestamptz not null
  )`);
});
afterAll(async () => { await mocks.pg.close(); });
beforeEach(async () => {
  await mocks.pg.exec("truncate projects, project_operations");
  await mocks.pg.query(`insert into projects
    (id, user_id, name, sandbox_id, github_repository_id, created_at, updated_at)
    values ($1, $2, 'Original', 'sandbox', '123', $5, $5),
           ($3, $4, 'Other project', 'other-sandbox', '456', $5, $5)`,
    [projectId, owner, otherProjectId, otherOwner, originalTimestamp]);
  mocks.getCurrentUser.mockResolvedValue({ userId: owner });
  mocks.logQuery.mockClear();
});

describe("project update API", () => {
  it("prevents edits after deletion has been requested", async () => {
    await mocks.pg.query("insert into project_operations values ($1, $2, $3, 'delete')", [otherProjectId, projectId, owner]);
    const response = await PATCH(request({ name: "Renamed" }), { projectId });
    expect(response.status).toBe(404);
    expect((await mocks.pg.query("select name from projects where id = $1", [projectId])).rows).toEqual([{ name: "Original" }]);
  });
  it("updates only the owner's project name, preserves other fields, and returns the updated project", async () => {
    const req = request({ name: " Renamed " });
    const response = await PATCH(req, { projectId });
    expect(response.status).toBe(200);
    expect(mocks.getCurrentUser).toHaveBeenCalledWith(req.headers);
    const body = await response.json();
    expect(body).toMatchObject({
      error: false,
      message: "Project updated successfully.",
      data: {
        id: projectId, userId: owner, name: "Renamed", sandboxId: "sandbox",
        githubRepositoryId: "123", createdAt: originalTimestamp,
      },
    });
    expect(new Date(body.data.updatedAt).getTime()).toBeGreaterThan(new Date(originalTimestamp).getTime());
    const { rows } = await mocks.pg.query("select id, name from projects order by id");
    expect(rows).toEqual([
      { id: projectId, name: "Renamed" },
      { id: otherProjectId, name: "Other project" },
    ]);
  });

  it.each([otherProjectId, "00000000-0000-4000-8000-000000000099"])(
    "returns 404 for an unowned or missing project: %s", async (targetId) => {
      const before = await mocks.pg.query("select * from projects order by id");
      const response = await PATCH(request({ name: "Renamed" }), { projectId: targetId });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: true, message: "Project not found." });
      expect(await mocks.pg.query("select * from projects order by id")).toEqual(before);
    },
  );

  it.each([{}, null, [], { name: " " }, { name: null }, { name: 5 },
    { name: "x".repeat(101) }, { userId: otherOwner },
    { name: "Renamed", userId: otherOwner }, { name: "Renamed", source: "github" },
  ])("rejects invalid or non-editable data: %j", async (payload) => {
    const response = await PATCH(request(payload), { projectId });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: true });
    expect(mocks.logQuery).not.toHaveBeenCalled();
  });

  it("rejects an update with only undefined values", () => {
    expect(updateProjectSchema.safeParse({ name: undefined }).success).toBe(false);
  });

  it("authenticates before reading the body or accessing the database", async () => {
    mocks.getCurrentUser.mockResolvedValue({ userId: null });
    const req = request({ name: "Renamed" });
    const readBody = vi.spyOn(req, "json");
    expect((await PATCH(req, { projectId })).status).toBe(401);
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.logQuery).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs and non-JSON content before querying", async () => {
    expect((await PATCH(request({ name: "Renamed" }), { projectId: "invalid" })).status).toBe(400);
    expect((await PATCH(request({ name: "Renamed" }, "text/plain"), { projectId })).status).toBe(415);
    expect(mocks.logQuery).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request(`https://codaloud.test/api/projects/${projectId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{",
    });
    expect((await PATCH(req, { projectId })).status).toBe(400);
    expect(mocks.logQuery).not.toHaveBeenCalled();
  });

  it.each(["authentication", "database"])("catches %s failures without exposing error details", async (source) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    if (source === "authentication") {
      mocks.getCurrentUser.mockRejectedValueOnce(new Error("Internal details"));
    } else {
      mocks.logQuery.mockImplementationOnce(() => { throw new Error("Internal details"); });
    }
    const response = await PATCH(request({ name: "Renamed" }), { projectId });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: true, message: "Unable to update project. Please try again.",
    });
  });
});
