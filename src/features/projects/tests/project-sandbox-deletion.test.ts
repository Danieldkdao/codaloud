import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { handleProjectSandbox } from "@/trigger/projects/handle-project-sandbox";

const mocks = vi.hoisted(() => ({
  pg: undefined as unknown as PGlite, get: vi.fn(), remove: vi.fn(), create: vi.fn(), logQuery: vi.fn(),
}));
vi.mock("@/db/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  mocks.pg = await PGlite.create();
  return { db: drizzle(mocks.pg, { logger: { logQuery: mocks.logQuery } }) };
});
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key", DAYTONA_TARGET: "us", TRIGGER_SECRET_KEY: "test-trigger" } }));
vi.mock("@daytona/sdk", () => ({
  Daytona: class { get = mocks.get; create = mocks.create; },
  DaytonaNotFoundError: class extends Error {},
}));
vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (options: unknown) => options,
  AbortTaskRunError: class extends Error {},
}));

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const operationId = "00000000-0000-4000-8000-000000000003";
const payload = { projectId, userId, operationId };
const ctx = { run: { id: "run_delete" }, attempt: { number: 1 } };
const task = handleProjectSandbox as unknown as {
  run: (input: typeof payload, context: { ctx: typeof ctx }) => Promise<unknown>;
  onFailure: (input: { payload: typeof payload; ctx: typeof ctx; error: Error }) => Promise<unknown>;
};
const run = () => task.run(payload, { ctx });
const project = async () => (await mocks.pg.query("select * from projects where id = $1", [projectId])).rows[0];
const operation = async () => (await mocks.pg.query<{
  status: string; phase: string; finished_at: Date | null; trigger_run_id: string | null; error_code: string | null;
}>("select * from project_operations where id = $1", [operationId])).rows[0];
let exists: boolean;
const sandbox = () => ({
  id: "sandbox_one", labels: { codaloudApp: "codaloud", codaloudProjectId: projectId },
  delete: mocks.remove,
});
beforeAll(async () => {
  await import("@/db/db");
  await mocks.pg.exec(`
    create table projects (
      id uuid primary key, user_id uuid not null, name text not null, sandbox_id text,
      setup_status text default 'pending', setup_error text, github_repository_id text,
      last_opened_file_path text, last_opened_at timestamptz,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table project_operations (
      id uuid primary key default gen_random_uuid(), project_id uuid not null, user_id uuid not null,
      kind text not null, status text default 'queued', phase text default 'queued',
      trigger_run_id text, github_account_id uuid, github_branch_name text, error_code text, error_message text,
      next_dispatch_at timestamptz default now(), dispatch_attempts integer default 1,
      created_at timestamptz default now(), updated_at timestamptz default now(), finished_at timestamptz
    );
  `);
});
afterAll(async () => { await mocks.pg.close(); });
beforeEach(async () => {
  mocks.logQuery.mockReset();
  await mocks.pg.exec("truncate projects, project_operations");
  await mocks.pg.query("insert into projects (id, user_id, name, sandbox_id) values ($1, $2, 'Delete me', 'sandbox_one')", [projectId, userId]);
  await mocks.pg.query("insert into project_operations (id, project_id, user_id, kind) values ($1, $2, $3, 'delete')", [operationId, projectId, userId]);
  exists = true;
  mocks.create.mockReset();
  mocks.remove.mockReset().mockImplementation(async () => {
    expect(await project()).toBeDefined();
    exists = false;
  });
  mocks.get.mockReset().mockImplementation(async () => {
    if (!exists) {
      const { DaytonaNotFoundError } = await import("@daytona/sdk");
      throw new DaytonaNotFoundError("missing");
    }
    return sandbox();
  });
});

it("confirms sandbox absence before deleting the project and keeps the cleanup record", async () => {
  await run();
  expect(mocks.remove).toHaveBeenCalledWith(120, true);
  expect(mocks.get).toHaveBeenCalledWith("sandbox_one");
  expect(mocks.get).toHaveBeenCalledWith(`codaloud-production-${projectId}`);
  expect(await project()).toBeUndefined();
  expect(await operation()).toMatchObject({ status: "succeeded", phase: "complete", finished_at: expect.any(Date) });
  expect(mocks.create).not.toHaveBeenCalled();
});

it("retains the project when deletion times out and retries without losing the binding", async () => {
  mocks.remove.mockRejectedValueOnce(new Error("private provider error"));
  await expect(run()).rejects.toThrow();
  expect(await project()).toMatchObject({ sandbox_id: "sandbox_one" });
  await task.onFailure({ payload, ctx, error: new Error("private provider error") });
  expect(await operation()).toMatchObject({ status: "queued", trigger_run_id: null, error_code: "SANDBOX_DELETE_RETRY" });
  await task.run(payload, { ctx: { ...ctx, run: { id: "run_retry" } } });
  expect(await project()).toBeUndefined();
});

it("does not remove the project on acceptance alone if the sandbox still exists", async () => {
  mocks.remove.mockResolvedValue(undefined);
  await expect(run()).rejects.toThrow();
  expect(await project()).toBeDefined();
});

it("treats a missing sandbox as successful cleanup", async () => {
  exists = false;
  await run();
  expect(await project()).toBeUndefined();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("recovers a lost delete response by checking absence on retry", async () => {
  mocks.remove.mockImplementationOnce(async () => { exists = false; throw new Error("lost response"); });
  await expect(run()).rejects.toThrow();
  expect(await project()).toBeDefined();
  await run();
  expect(mocks.remove).toHaveBeenCalledTimes(1);
  expect(await project()).toBeUndefined();
});

it("finds a sandbox whose creation succeeded before its ID was saved", async () => {
  await mocks.pg.exec("update projects set sandbox_id = null");
  await run();
  expect(mocks.get).toHaveBeenCalledWith(`codaloud-production-${projectId}`);
  expect(await project()).toBeUndefined();
});

it("refuses to delete a sandbox with another project's labels", async () => {
  mocks.get.mockResolvedValue({ ...sandbox(), labels: { codaloudApp: "codaloud", codaloudProjectId: "other-project" } });
  await expect(run()).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(await project()).toBeDefined();
});

it("does not mistake provider authentication or network failures for absence", async () => {
  mocks.get.mockRejectedValue(new Error("unauthorized"));
  await expect(run()).rejects.toThrow();
  expect(await project()).toBeDefined();
});

it("retries the final database deletion if the sandbox is already gone", async () => {
  mocks.logQuery.mockImplementation((query: string) => {
    if (query.startsWith('delete from "projects"')) throw new Error("database failed");
  });
  await expect(run()).rejects.toThrow();
  expect(await project()).toBeDefined();
  mocks.logQuery.mockReset();
  await run();
  expect(await project()).toBeUndefined();
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});

it("reuses one durable operation when deletion is requested twice", async () => {
  await mocks.pg.exec("delete from project_operations");
  const { requestProjectDeletionDb } = await import("@/features/projects/server/project-deletion");
  const results = await Promise.all([
    requestProjectDeletionDb(userId, projectId), requestProjectDeletionDb(userId, projectId),
  ]);
  expect(results[0]?.operation.id).toBe(results[1]?.operation.id);
  expect((await mocks.pg.query("select * from project_operations")).rows).toHaveLength(1);
  expect(await project()).toBeDefined();
});

it("cleans up a late-created sandbox after the project has already been removed", async () => {
  await run();
  const firstCompletion = (await operation()).finished_at;
  await mocks.pg.exec("update project_operations set status = 'queued', trigger_run_id = null");
  exists = true;
  mocks.remove.mockImplementation(async () => { exists = false; });
  await task.run(payload, { ctx: { ...ctx, run: { id: "run_late_cleanup" } } });
  expect(exists).toBe(false);
  expect((await operation()).finished_at!.getTime()).toBeGreaterThanOrEqual(firstCompletion!.getTime());
});

it("preserves the monitoring deadline when a recheck finds no sandbox", async () => {
  await run();
  const firstCompletion = (await operation()).finished_at;
  await mocks.pg.exec("update project_operations set status = 'queued', trigger_run_id = null");
  await run();
  expect((await operation()).finished_at).toEqual(firstCompletion);
});

it("keeps retrying a failed late cleanup beyond the original monitoring window", async () => {
  await run();
  await mocks.pg.exec(`update project_operations set status = 'queued', trigger_run_id = null,
    finished_at = now() - interval '6 days 23 hours 59 minutes'`);
  exists = true;
  mocks.remove.mockRejectedValue(new Error("provider unavailable"));
  await expect(run()).rejects.toThrow();
  // Once a sandbox is found again, cleanup must finish even if the worker crashes.
  expect((await operation()).finished_at).toBeNull();
});

it("stops monitoring successful cleanup after seven days", async () => {
  await run();
  await mocks.pg.exec(`update project_operations set finished_at = now() - interval '8 days',
    next_dispatch_at = now() - interval '1 minute'`);
  const fetchRun = vi.fn();
  vi.stubGlobal("fetch", fetchRun);
  const { reconcileProjectDeletionRuns } = await import("@/features/projects/server/project-deletion");
  await reconcileProjectDeletionRuns(Date.now() + 40_000);
  expect(fetchRun).not.toHaveBeenCalled();
  await mocks.pg.exec("update project_operations set status = 'queued', trigger_run_id = null");
  const { readDueProjectSandboxOperationsDb } = await import("@/features/projects/server/project-operations");
  expect(await readDueProjectSandboxOperationsDb(10)).toEqual([]);
});

it("blocks setup as soon as deletion is recorded", async () => {
  const setupId = "00000000-0000-4000-8000-000000000004";
  await mocks.pg.query(`insert into project_operations (id, project_id, user_id, kind, created_at)
    values ($1, $2, $3, 'prepare', now() + interval '1 second')`, [setupId, projectId, userId]);
  await expect(task.run({ ...payload, operationId: setupId }, { ctx })).rejects.toThrow();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});

it.each([false, true])("reconciles an accepted cleanup run with terminal=%s", async (isCompleted) => {
  await mocks.pg.exec("update project_operations set status = 'running', trigger_run_id = 'run_delete', next_dispatch_at = now() - interval '1 second'");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: ctx.run.id, isCompleted })));
  const { reconcileProjectDeletionRuns } = await import("@/features/projects/server/project-deletion");
  await reconcileProjectDeletionRuns(Date.now() + 40_000);
  expect(await operation()).toMatchObject(isCompleted
    ? { status: "queued", trigger_run_id: null }
    : { status: "running", trigger_run_id: ctx.run.id });
  expect(await project()).toBeDefined();
});

it("does not redispatch active work when the run-status request fails", async () => {
  await mocks.pg.exec("update project_operations set status = 'running', trigger_run_id = 'run_delete'");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { reconcileProjectDeletionRuns } = await import("@/features/projects/server/project-deletion");
  await reconcileProjectDeletionRuns(Date.now() + 40_000);
  expect(await operation()).toMatchObject({ status: "running", trigger_run_id: ctx.run.id });
  expect((await mocks.pg.query("select id from project_operations where next_dispatch_at > now()")).rows).toHaveLength(1);
});
