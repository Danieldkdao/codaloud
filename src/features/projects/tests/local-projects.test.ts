import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/expo-sqlite/driver";
import type { SQLiteDatabase } from "expo-sqlite";
import { projectsMigration } from "@/db/migrations";
import * as schema from "@/db/schema";
import { createLocalProjectStore } from "../local/projects";

const timestamp = "2026-09-18T12:00:00.000Z";
const project = (id: number, name: string) => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  name, setupStatus: "ready" as const,
  setupError: null, githubRepositoryId: null, lastOpenedFilePath: null,
  lastOpenedAt: null, createdAt: timestamp, updatedAt: timestamp,
});

describe("local project storage", () => {
  let sqlite: DatabaseSync;
  let store: ReturnType<typeof createLocalProjectStore>;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(projectsMigration);
    // Run the production Drizzle queries against actual SQLite, without loading
    // React Native. Only Expo's native statement boundary is adapted here.
    const client = {
      prepareSync: (query: string) => ({
        executeSync: (params: (string | number | null)[]) => {
          const statement = sqlite.prepare(query);
          if (statement.columns().length > 0) {
            const rows = statement.all(...params);
            return { getAllSync: () => rows, getFirstSync: () => rows[0] };
          }
          return statement.run(...params);
        },
        executeForRawResultSync: (params: (string | number | null)[]) => {
          const statement = sqlite.prepare(query);
          statement.setReturnArrays(true);
          return { getAllSync: () => statement.all(...params) };
        },
      }),
    } as unknown as SQLiteDatabase;
    store = createLocalProjectStore(drizzle(client, { schema }));
  });

  afterEach(() => sqlite.close());

  it("reads, renames, and deletes device projects by project ID", () => {
    const original = project(10, "Local");
    store.insert(original);
    expect(store.read(original.id)).toEqual(original);
    expect(store.list().projects).toEqual([original]);
    expect(store.rename(original.id, "Changed")?.name).toBe("Changed");
    expect(store.remove(original.id)?.id).toBe(original.id);
    expect(store.read(original.id)).toBeNull();
    expect(store.list().projects).toEqual([]);
  });

  it("paginates tied values without skipping or repeating projects", () => {
    for (const id of [12, 10, 11]) store.insert(project(id, "Same"));
    const first = store.list({ pageSize: 2, sortBy: "name" });
    const second = store.list({ pageSize: 2, sortBy: "name", cursor: first.nextCursor });
    expect([...first.projects, ...second.projects].map((item) => item.id))
      .toEqual([10, 11, 12].map((id) => project(id, "").id));
    expect(second.nextCursor).toBeNull();
  });

  it("searches case-insensitively and treats SQL wildcards literally", () => {
    store.insert(project(10, "100%_Ready"));
    store.insert(project(11, "Another project"));
    expect(store.list({ search: "%_rEaDy" }).projects.map((item) => item.name))
      .toEqual(["100%_Ready"]);
  });

  it("searches Unicode names after creation and renaming", () => {
    const original = project(10, "ÉCOLE");
    store.insert(original);
    expect(store.list({ search: "école" }).projects).toHaveLength(1);
    store.rename(original.id, "ÜBER");
    expect(store.list({ search: "über" }).projects).toHaveLength(1);
    expect(store.list({ search: "école" }).projects).toHaveLength(0);
  });

  it("keeps project IDs and timestamps and refuses duplicate inserts", () => {
    const original = project(10, "Saved");
    expect(store.insert(original)).toEqual(original);
    expect(() => store.insert(original)).toThrow();
    expect(store.read(original.id)).toEqual(original);
  });

  it("rejects cursors from a different search and refuses invalid updates", () => {
    for (const id of [10, 11]) store.insert(project(id, "Same"));
    const page = store.list({ pageSize: 1 });
    expect(() => store.list({ cursor: page.nextCursor, search: "different" })).toThrow();
    expect(() => store.rename(project(10, "").id, "   ")).toThrow();
  });
});
