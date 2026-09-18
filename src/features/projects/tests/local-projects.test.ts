import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/expo-sqlite/driver";
import type { SQLiteDatabase } from "expo-sqlite";
import { localWorkspaceMigration } from "@/db/migrations";
import * as schema from "@/db/schema";
import { createLocalProjectStore } from "../local/projects";

const owner = "00000000-0000-4000-8000-000000000001";
const otherOwner = "00000000-0000-4000-8000-000000000002";
const timestamp = "2026-09-18T12:00:00.000Z";
const project = (id: number, name: string, userId = owner) => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  userId, name, sandboxId: null, setupStatus: "ready" as const,
  setupError: null, githubRepositoryId: null, lastOpenedFilePath: null,
  lastOpenedAt: null, createdAt: timestamp, updatedAt: timestamp,
});

describe("local project storage", () => {
  let sqlite: DatabaseSync;
  let store: ReturnType<typeof createLocalProjectStore>;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(localWorkspaceMigration);
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

  it("isolates reads, updates, and deletion by owner", () => {
    store.insert(project(10, "Private", otherOwner));
    expect(store.read(owner, project(10, "").id)).toBeNull();
    expect(store.list(owner).projects).toEqual([]);
    expect(store.rename(owner, project(10, "").id, "Changed")).toBeNull();
    expect(store.remove(owner, project(10, "").id)).toBeNull();
    expect(store.read(otherOwner, project(10, "").id)?.name).toBe("Private");
  });

  it("paginates tied values without skipping or repeating projects", () => {
    for (const id of [12, 10, 11]) store.insert(project(id, "Same"));
    const first = store.list(owner, { pageSize: 2, sortBy: "name" });
    const second = store.list(owner, { pageSize: 2, sortBy: "name", cursor: first.nextCursor });
    expect([...first.projects, ...second.projects].map((item) => item.id))
      .toEqual([10, 11, 12].map((id) => project(id, "").id));
    expect(second.nextCursor).toBeNull();
  });

  it("searches case-insensitively and treats SQL wildcards literally", () => {
    store.insert(project(10, "100%_Ready"));
    store.insert(project(11, "Another project"));
    expect(store.list(owner, { search: "%_rEaDy" }).projects.map((item) => item.name))
      .toEqual(["100%_Ready"]);
  });

  it("searches Unicode names after creation and renaming", () => {
    const original = project(10, "ÉCOLE");
    store.insert(original);
    expect(store.list(owner, { search: "école" }).projects).toHaveLength(1);
    store.rename(owner, original.id, "ÜBER");
    expect(store.list(owner, { search: "über" }).projects).toHaveLength(1);
    expect(store.list(owner, { search: "école" }).projects).toHaveLength(0);
  });

  it("keeps imported IDs and timestamps and refuses duplicate inserts", () => {
    const original = project(10, "Imported");
    expect(store.insert(original)).toEqual(original);
    expect(() => store.insert(original)).toThrow();
    expect(store.read(owner, original.id)).toEqual(original);
  });

  it("rejects cursors from a different search and refuses invalid updates", () => {
    for (const id of [10, 11]) store.insert(project(id, "Same"));
    const page = store.list(owner, { pageSize: 1 });
    expect(() => store.list(owner, { cursor: page.nextCursor, search: "different" })).toThrow();
    expect(() => store.rename(owner, project(10, "").id, "   ")).toThrow();
  });
});
