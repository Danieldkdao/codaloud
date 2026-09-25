import { afterEach, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { neonConfig } from "@neondatabase/serverless";
vi.mock("@/data/env/server", () => ({
  serverEnv: { DATABASE_URL: "postgresql://user:password@database.example/db" },
}));
vi.mock("ws", () => ({
  default: class {
    constructor() {
      throw new Error("Unexpected WebSocket connection");
    }
  },
}));
import { db } from "@/db/cloud/db";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("runs standalone cloud queries over HTTP without opening a WebSocket", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      fields: [{ name: "value", dataTypeID: 23 }],
      rows: [["1"]],
      rowCount: 1,
      command: "SELECT",
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await db.execute(sql`select 1 as value`);
  expect(result.rows).toEqual([{ value: 1 }]);
  expect(fetch).toHaveBeenCalledOnce();
});
it("bounds a stalled cloud HTTP request", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new Error("timed out")),
          );
        }),
    ),
  );
  const result = db.execute(sql`select 1`);
  const failed = expect(result).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(8000);
  await failed;
  expect(neonConfig.poolQueryViaFetch).toBe(true);
});
