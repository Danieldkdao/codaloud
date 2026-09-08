import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { startProjectSandbox } from "@/trigger/projects/start-project-sandbox";
import { updateProjectOperationRunDb } from "@/features/projects/server/project-operations";

const mocks = vi.hoisted(() => ({
  pg: undefined as unknown as PGlite,
  get: vi.fn(), create: vi.fn(), start: vi.fn(), waitUntilStarted: vi.fn(), logQuery: vi.fn(),
}));
vi.mock("@/db/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  mocks.pg = await PGlite.create();
  return { db: drizzle(mocks.pg, { logger: { logQuery: mocks.logQuery } }) };
});
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key", DAYTONA_TARGET: "us" } }));
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
const ctx = { run: { id: "run_sandbox" }, attempt: { number: 1 } };
const task = startProjectSandbox as unknown as {
  run: (input: typeof payload, context: { ctx: typeof ctx }) => Promise<unknown>;
  onFailure: (input: { payload: typeof payload; ctx: typeof ctx; error: Error }) => Promise<unknown>;
};
const run = () => task.run(payload, { ctx });
const sandbox = () => ({
  id: "sandbox_one", state: "stopped",
  labels: { codaloudApp: "codaloud", codaloudProjectId: projectId },
  start: mocks.start, waitUntilStarted: mocks.waitUntilStarted,
});
const state = async () => (await mocks.pg.query<{
  setup_status: string; setup_error: string | null; status: string; phase: string;
  sandbox_id: string | null; trigger_run_id: string | null; finished_at: Date | null;
  error_message: string | null;
}>(`select p.setup_status, p.setup_error, p.sandbox_id, o.status, o.phase,
  o.trigger_run_id, o.finished_at, o.error_message
  from projects p join project_operations o on o.project_id = p.id where o.id = $1`, [operationId])).rows[0];

beforeAll(async () => {
  await mocks.pg.exec(`
    create table projects (
      id uuid primary key, user_id uuid not null, name text not null,
      sandbox_id text, setup_status text default 'pending', setup_error text,
      github_repository_id text, last_opened_file_path text, last_opened_at timestamptz,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table project_operations (
      id uuid primary key, project_id uuid not null, user_id uuid not null,
      kind text not null, status text default 'queued', phase text default 'queued',
      trigger_run_id text, github_account_id uuid, error_code text, error_message text,
      next_dispatch_at timestamptz default now(), dispatch_attempts integer default 1,
      created_at timestamptz default now(), updated_at timestamptz default now(), finished_at timestamptz
    );
  `);
});
afterAll(async () => { await mocks.pg.close(); });
beforeEach(async () => {
  mocks.logQuery.mockReset();
  await mocks.pg.exec("truncate projects, project_operations");
  await mocks.pg.query("insert into projects (id, user_id, name) values ($1, $2, 'Lifecycle')", [projectId, userId]);
  await mocks.pg.query("insert into project_operations (id, project_id, user_id, kind) values ($1, $2, $3, 'prepare')", [operationId, projectId, userId]);
  mocks.get.mockReset().mockImplementation(async () => sandbox());
  mocks.create.mockReset().mockImplementation(async () => sandbox());
  mocks.start.mockReset().mockResolvedValue(undefined);
  mocks.waitUntilStarted.mockReset().mockResolvedValue(undefined);
});

it("records running and the accepted run before contacting Daytona", async () => {
  mocks.get.mockImplementation(async () => {
    expect(await state()).toMatchObject({
      setup_status: "running", status: "running", phase: "creating-sandbox", trigger_run_id: ctx.run.id,
    });
    return sandbox();
  });
  mocks.start.mockImplementation(async () => {
    expect(await state()).toMatchObject({ sandbox_id: "sandbox_one", phase: "starting-sandbox" });
  });
  await run();
  expect((await state()).status).not.toBe("queued");
});

it.each([null, "123456"])("finishes sandbox startup without claiming files are ready (repository %s)", async (repositoryId) => {
  await mocks.pg.query("update projects set github_repository_id = $1", [repositoryId]);
  await run();
  expect(await state()).toMatchObject({
    setup_status: "running", status: "succeeded", phase: "complete",
    sandbox_id: "sandbox_one", trigger_run_id: ctx.run.id, finished_at: expect.any(Date),
  });
  await task.onFailure({ payload, ctx, error: new Error("late failure") });
  expect((await state()).status).toBe("succeeded");
  await run();
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

it("does not overwrite a newer operation when startup finishes late", async () => {
  mocks.start.mockImplementation(async () => {
    await mocks.pg.query(`insert into project_operations (id, project_id, user_id, kind, created_at)
      values ('00000000-0000-4000-8000-000000000004', $1, $2, 'delete', now() + interval '1 second')`, [projectId, userId]);
    await mocks.pg.exec("update projects set setup_status = 'failed', setup_error = 'Newer operation'");
  });
  await expect(run()).rejects.toThrow();
  await task.onFailure({ payload, ctx, error: new Error("old run failed") });
  expect(await state()).toMatchObject({ setup_error: "Newer operation", status: "running" });
});

it("does not report success if the final database write fails", async () => {
  let failCompletion = true;
  mocks.logQuery.mockImplementation((query: string, params: unknown[]) => {
    if (failCompletion && query.startsWith('update "project_operations"') && params.includes("succeeded")) {
      throw new Error("database unavailable");
    }
  });
  await expect(run()).rejects.toThrow();
  expect(await state()).toMatchObject({ status: "running", finished_at: null });
  failCompletion = false;
  await run();
  expect((await state()).status).toBe("succeeded");
});

it("preserves an already-prepared project's readiness", async () => {
  await mocks.pg.exec("update projects set setup_status = 'ready', sandbox_id = 'sandbox_one'");
  await run();
  expect((await state()).setup_status).toBe("ready");
});

it("supports an old payload only when its run is already recorded", async () => {
  await mocks.pg.query("update project_operations set trigger_run_id = $1", [ctx.run.id]);
  await task.run({ projectId, userId } as typeof payload, { ctx });
  expect((await state()).status).toBe("succeeded");
});

it("rolls back the operation transition if updating its project fails", async () => {
  mocks.logQuery.mockImplementation((query: string) => {
    if (query.startsWith('update "projects"')) throw new Error("database unavailable");
  });
  await expect(run()).rejects.toThrow();
  expect(await state()).toMatchObject({ status: "queued", setup_status: "pending", trigger_run_id: null });
  expect(mocks.get).not.toHaveBeenCalled();
});

it("keeps transient errors retryable and records failure only after retries are exhausted", async () => {
  mocks.start.mockRejectedValueOnce(new Error("private provider details test-key"));
  await expect(run()).rejects.toThrow();
  expect(await state()).toMatchObject({ setup_status: "running", status: "running", finished_at: null });
  await task.onFailure({ payload, ctx, error: new Error("private provider details test-key") });
  expect(await state()).toMatchObject({ setup_status: "failed", status: "failed", finished_at: expect.any(Date) });
  expect(JSON.stringify(await state())).not.toMatch(/private provider|test-key/);
});

it("retries the same run using the saved sandbox after a transient start failure", async () => {
  mocks.start.mockRejectedValueOnce(new Error("temporarily unavailable"));
  await expect(run()).rejects.toThrow();
  await task.run(payload, { ctx: { ...ctx, attempt: { number: 2 } } });
  expect(mocks.get).toHaveBeenLastCalledWith("sandbox_one");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("rejects another run claiming the same operation before provider calls", async () => {
  await mocks.pg.query("update project_operations set trigger_run_id = 'run_other'");
  await expect(run()).rejects.toThrow();
  expect(mocks.get).not.toHaveBeenCalled();
  expect((await state()).setup_status).toBe("pending");
});

it("does not change another user's project", async () => {
  await expect(task.run({ ...payload, userId: "00000000-0000-4000-8000-000000000099" }, { ctx })).rejects.toThrow();
  expect(mocks.get).not.toHaveBeenCalled();
  expect((await state()).setup_status).toBe("pending");
});

it("accepts late dispatch acknowledgement without clearing an execution failure", async () => {
  mocks.start.mockRejectedValueOnce(new Error("start failed"));
  await expect(run()).rejects.toThrow();
  await task.onFailure({ payload, ctx, error: new Error("start failed") });
  const failed = await state();
  expect(await updateProjectOperationRunDb(operationId, userId, ctx.run.id, 1)).toBeDefined();
  expect(await state()).toEqual(failed);
});
