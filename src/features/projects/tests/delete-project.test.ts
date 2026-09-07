import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

import { DELETE } from "@/app/api/projects/[projectId]+api";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), logQuery: vi.fn(), pg: undefined as unknown as PGlite,
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
const secondOwnedProjectId = "00000000-0000-4000-8000-000000000005";
const request = () => new Request(`https://codaloud.test/api/projects/${projectId}`, { method: "DELETE" });

beforeAll(async () => {
  await mocks.pg.exec(`create table projects (
    id uuid primary key, user_id uuid not null, name text not null,
    sandbox_id text, setup_status text not null default 'pending', setup_error text,
    github_repository_id text, last_opened_file_path text, last_opened_at timestamptz,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  )`);
});
afterAll(async () => { await mocks.pg.close(); });
beforeEach(async () => {
  await mocks.pg.exec("truncate projects");
  await mocks.pg.query(`insert into projects (id, user_id, name) values
    ($1, $2, 'Delete me'), ($3, $4, 'Other user'), ($5, $2, 'Keep mine')`,
    [projectId, owner, otherProjectId, otherOwner, secondOwnedProjectId]);
  mocks.getCurrentUser.mockReset().mockResolvedValue({ userId: owner });
  mocks.logQuery.mockReset();
});

it("deletes only the requested owned project and returns the deleted record", async () => {
  const req = request();
  const response = await DELETE(req, { projectId });
  expect(response.status).toBe(200);
  expect(mocks.getCurrentUser).toHaveBeenCalledWith(req.headers);
  expect(await response.json()).toMatchObject({
    error: false, message: "Project deleted successfully.",
    data: { id: projectId, userId: owner, name: "Delete me" },
  });
  expect((await mocks.pg.query("select id from projects order by id")).rows).toEqual([
    { id: otherProjectId }, { id: secondOwnedProjectId },
  ]);
});

it.each([otherProjectId, "00000000-0000-4000-8000-000000000099"])("returns 404 without deleting anything for unowned or missing project %s", async (id) => {
  const before = await mocks.pg.query("select * from projects order by id");
  const response = await DELETE(request(), { projectId: id });
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: true, message: "Project not found." });
  expect(await mocks.pg.query("select * from projects order by id")).toEqual(before);
});

it("returns 404 when the project has already been deleted", async () => {
  await DELETE(request(), { projectId });
  expect((await DELETE(request(), { projectId })).status).toBe(404);
});

it.each([null, ""])("rejects missing authentication %s before validating project ID or querying", async (userId) => {
  mocks.getCurrentUser.mockResolvedValue({ userId });
  const response = await DELETE(request(), { projectId: "invalid" });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: true, message: "You must be signed in to delete a project." });
  expect(mocks.logQuery).not.toHaveBeenCalled();
});

it("rejects an invalid authenticated user ID before querying", async () => {
  mocks.getCurrentUser.mockResolvedValue({ userId: "invalid" });
  expect((await DELETE(request(), { projectId })).status).toBe(401);
  expect(mocks.logQuery).not.toHaveBeenCalled();
});

it.each(["", "invalid", "../projects"])("rejects invalid project ID %s before querying", async (id) => {
  const response = await DELETE(request(), { projectId: id });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: true, message: "Invalid project ID." });
  expect(mocks.logQuery).not.toHaveBeenCalled();
});

it.each(["authentication", "database"])("catches %s errors without exposing details or deleting data", async (stage) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  if (stage === "authentication") mocks.getCurrentUser.mockRejectedValueOnce(new Error("Private details"));
  else mocks.logQuery.mockImplementationOnce(() => { throw new Error("Private details"); });
  const before = await mocks.pg.query("select * from projects order by id");
  const response = await DELETE(request(), { projectId });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: true, message: "Unable to delete project. Please try again." });
  expect(await mocks.pg.query("select * from projects order by id")).toEqual(before);
});
