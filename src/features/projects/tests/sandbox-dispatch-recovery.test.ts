import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/projects+api";
import * as operations from "@/features/projects/server/project-operations";
import * as dispatch from "@/features/projects/server/dispatch-project-sandbox";

const mocks = vi.hoisted(() => ({
  pg: undefined as unknown as PGlite,
  logQuery: vi.fn(),
}));

vi.mock("@/db/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  mocks.pg = await PGlite.create();
  return { db: drizzle(mocks.pg, { logger: { logQuery: mocks.logQuery } }) };
});
vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: async () => ({ userId: "00000000-0000-4000-8000-000000000001" }),
}));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: {} } }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => undefined }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@/data/env/server", () => ({ serverEnv: { TRIGGER_SECRET_KEY: "test-secret" } }));
vi.mock("@trigger.dev/sdk", () => ({ schedules: { task: (options: unknown) => options } }));

const network = vi.fn<typeof fetch>();
const createProject = () => POST(new Request("https://codaloud.test/api/projects", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Recover me", source: "new" }),
}));
const readOperation = async () => (await mocks.pg.query<{
  id: string; project_id: string; user_id: string; dispatch_attempts: number;
  trigger_run_id: string | null; error_code: string | null; error_message: string | null;
  next_dispatch_at: Date;
}>("select * from project_operations order by created_at limit 1")).rows[0];
const makeDue = () => mocks.pg.exec("update project_operations set next_dispatch_at = now() - interval '1 second'");
const runSchedule = async () => {
  const { retryProjectSandboxDispatches } = await import("@/trigger/projects/retry-project-sandbox-dispatches");
  // The SDK is mocked only at registration; execute the real scheduled callback.
  return (retryProjectSandboxDispatches as unknown as { run: () => Promise<unknown> }).run();
};

beforeAll(async () => {
  // Minimal database fixture for behavioral dispatch tests, not schema validation.
  await mocks.pg.exec(`
    create table projects (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null,
      sandbox_id text, setup_status text default 'pending', setup_error text,
      github_repository_id text, last_opened_file_path text, last_opened_at timestamptz,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table project_operations (
      id uuid primary key default gen_random_uuid(), project_id uuid not null, user_id uuid not null,
      kind text not null, status text default 'queued', phase text default 'queued',
      trigger_run_id text, github_account_id uuid, error_code text, error_message text,
      next_dispatch_at timestamptz default now(), dispatch_attempts integer default 0,
      created_at timestamptz default now(), updated_at timestamptz default now(), finished_at timestamptz
    );
  `);
});
afterAll(async () => { await mocks.pg.close(); });
beforeEach(async () => {
  await mocks.pg.exec("truncate projects, project_operations");
  mocks.logQuery.mockReset();
  network.mockReset().mockImplementation(async () => Response.json({ id: "run_recovered" }));
  vi.stubGlobal("fetch", network);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("durable sandbox dispatch recovery", () => {
  it.each(["rejected", "timeout", "invalid-response"])("recovers a project after %s without another client request", async (outcome) => {
    network.mockImplementationOnce(async () => {
      if (outcome === "timeout") throw new DOMException("private test-secret", "TimeoutError");
      return outcome === "rejected"
        ? Response.json({ error: "private test-secret" }, { status: 503 })
        : Response.json({ unexpected: "private test-secret" });
    });
    const response = await createProject();
    expect(response.status).toBe(201);
    const operation = await readOperation();
    expect(operation.dispatch_attempts).toBe(1);
    expect(operation.trigger_run_id).toBeNull();
    expect(operation.next_dispatch_at.getTime()).toBeGreaterThan(Date.now());
    expect(operation.error_message).not.toMatch(/test-secret|private/);

    await runSchedule();
    expect(network).toHaveBeenCalledTimes(1);
    await makeDue();
    await runSchedule();
    expect(network).toHaveBeenCalledTimes(2);
    expect(network.mock.calls[1][1]?.body).toBe(network.mock.calls[0][1]?.body);
    expect(await readOperation()).toMatchObject({
      dispatch_attempts: 2, trigger_run_id: "run_recovered", error_code: null, error_message: null,
    });
    await makeDue();
    await runSchedule();
    expect(network).toHaveBeenCalledTimes(2);
    expect((await mocks.pg.query("select id from projects")).rows).toHaveLength(1);
  });

  it("recovers acceptance when the run-ID database write fails", async () => {
    mocks.logQuery.mockImplementation((query: string) => {
      if (query.startsWith('update "project_operations" set "trigger_run_id"')) {
        throw new Error("database unavailable");
      }
    });
    expect((await createProject()).status).toBe(201);
    expect((await readOperation()).trigger_run_id).toBeNull();
    mocks.logQuery.mockReset();
    await makeDue();
    await runSchedule();
    expect((await readOperation()).trigger_run_id).toBe("run_recovered");
    expect(network.mock.calls[1][1]?.body).toBe(network.mock.calls[0][1]?.body);
  });

  it("claims once when the API and another dispatcher race", async () => {
    network.mockRejectedValueOnce(new Error("offline"));
    await createProject();
    await makeDue();
    const operation = await readOperation();
    network.mockImplementation(async () => Response.json({ id: "run_once" }));
    await Promise.all([
      dispatch.submitProjectSandbox(operation.id, operation.user_id),
      dispatch.submitProjectSandbox(operation.id, operation.user_id),
      runSchedule(),
    ]);
    expect(network).toHaveBeenCalledTimes(2);
    expect((await readOperation()).dispatch_attempts).toBe(2);
  });

  it("recovers an expired claim after the dispatcher dies before submitting", async () => {
    network.mockRejectedValueOnce(new Error("offline"));
    await createProject();
    await makeDue();
    const operation = await readOperation();
    expect(await operations.claimProjectSandboxDispatchDb(operation.id, operation.user_id)).toBeDefined();
    await runSchedule();
    expect(network).toHaveBeenCalledTimes(1);
    await makeDue();
    await runSchedule();
    expect((await readOperation()).trigger_run_id).toBe("run_recovered");
  });

  it("backs off repeated failures to at most five minutes", async () => {
    network.mockImplementation(async () => Response.json({}, { status: 503 }));
    await createProject();
    for (const delaySeconds of [120, 240, 300, 300]) {
      await makeDue();
      await runSchedule();
      const { rows } = await mocks.pg.query<{ seconds: number }>(
        "select extract(epoch from (next_dispatch_at - now()))::float as seconds from project_operations",
      );
      expect(rows[0].seconds).toBeGreaterThan(delaySeconds - 5);
      expect(rows[0].seconds).toBeLessThanOrEqual(delaySeconds);
    }
  });

  it("does not let a stale claimant overwrite a newer attempt or its acknowledgement", async () => {
    network.mockRejectedValueOnce(new Error("offline"));
    await createProject();
    await makeDue();
    const operation = await readOperation();
    const claimed = await operations.claimProjectSandboxDispatchDb(operation.id, operation.user_id);
    expect(claimed?.dispatchAttempts).toBe(2);
    await makeDue();
    await runSchedule();
    await operations.recordProjectSandboxDispatchFailureDb(operation.id, operation.user_id, 2);
    expect(await operations.updateProjectOperationRunDb(operation.id, operation.user_id, "run_stale", 2)).toBeUndefined();
    expect(await readOperation()).toMatchObject({
      trigger_run_id: "run_recovered", dispatch_attempts: 3, error_code: null,
    });
  });

  it("requires the operation owner even when directly claiming an operation", async () => {
    network.mockRejectedValueOnce(new Error("offline"));
    await createProject();
    await makeDue();
    const operation = await readOperation();
    expect(await operations.claimProjectSandboxDispatchDb(
      operation.id, "00000000-0000-4000-8000-000000000099",
    )).toBeUndefined();
    expect((await readOperation()).dispatch_attempts).toBe(1);
  });

  it.each([
    "update project_operations set status = 'failed'",
    "update project_operations set status = 'succeeded'",
    "update project_operations set status = 'running'",
    "update project_operations set kind = 'resume'",
    "delete from projects",
    "update projects set user_id = '00000000-0000-4000-8000-000000000099'",
  ])("does not submit ineligible work: %s", async (sql) => {
    network.mockRejectedValueOnce(new Error("offline"));
    await createProject();
    await makeDue();
    await mocks.pg.exec(sql);
    await runSchedule();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("continues to another due project when one submission fails", async () => {
    network.mockImplementation(async () => Response.json({}, { status: 503 }));
    await createProject();
    await createProject();
    await makeDue();
    network.mockReset()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ id: "run_second" }));
    await runSchedule();
    expect(network).toHaveBeenCalledTimes(2);
    expect((await mocks.pg.query("select id from project_operations where trigger_run_id = 'run_second'")).rows).toHaveLength(1);
  });
});
