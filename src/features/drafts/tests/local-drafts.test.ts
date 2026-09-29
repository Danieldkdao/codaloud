import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/expo-sqlite/driver";
import type { SQLiteDatabase } from "expo-sqlite";
import { draftsMigration } from "@/db/local/migrations";
import * as schema from "@/db/local/schema";
import { localDraftStore } from "../local/drafts";

const database = vi.hoisted(() => ({
  current: undefined as unknown as import("@/db/local/db").Db,
}));
vi.mock("@/db/local/db", () => ({ get db() { return database.current; } }));

const createdAt = "2026-09-18T12:00:00.000Z";
const updatedAt = "2026-09-19T12:00:00.000Z";

const draftId = (id: number) =>
  `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;

const draft = (id: number, overrides: Record<string, unknown> = {}) => ({
  id: draftId(id),
  filename: null as string | null,
  content: `Draft ${id}`,
  createdAt,
  updatedAt,
  ...overrides,
});

describe("local draft storage", () => {
  let sqlite: DatabaseSync;
  const store = localDraftStore;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(draftsMigration);
    // Run the production Drizzle queries against real SQLite; only Expo's
    // native statement boundary is adapted here.
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
    database.current = drizzle(client, { schema });
  });

  afterEach(() => sqlite.close());

  it("reads, updates, and deletes a draft by its own identity", () => {
    const original = draft(1);
    store.insert(original);
    expect(store.read(original.id)).toEqual(original);
    expect(store.list().drafts).toEqual([original]);
    expect(store.update(original.id, { content: "Changed" })?.content).toBe("Changed");
    expect(store.remove(original.id)?.id).toBe(original.id);
    expect(store.read(original.id)).toBeNull();
    expect(store.list().drafts).toEqual([]);
  });

  it("returns null instead of throwing when a row is missing", () => {
    expect(store.read(draftId(404))).toBeNull();
    expect(store.update(draftId(404), { content: "x" })).toBeNull();
    expect(store.remove(draftId(404))).toBeNull();
  });

  it("keeps drafts that share a title or filename as separate items", () => {
    const first = draft(1, { filename: "helper.ts", content: "one" });
    const second = draft(2, { filename: "helper.ts", content: "two" });
    const third = draft(3);
    const fourth = draft(4);
    store.insert(first);
    store.insert(second);
    store.insert(third);
    store.insert(fourth);
    expect(store.list().drafts).toHaveLength(4);
    expect(store.list({ search: "helper.ts" }).drafts.map((item) => item.id))
      .toEqual([first.id, second.id]);
    expect(store.list({ search: "Untitled Draft" }).drafts.map((item) => item.id))
      .toEqual([third.id, fourth.id]);
  });

  it("refuses to save an empty unnamed draft but allows a named empty draft", () => {
    expect(() => store.insert(draft(1, { content: "" }))).toThrow();
    const named = draft(2, { filename: "empty.md", content: "" });
    expect(store.insert(named).content).toBe("");
    expect(store.list({ search: "empty.md" }).drafts).toHaveLength(1);
  });

  it("refuses an update that would leave a draft empty and unnamed", () => {
    const saved = store.insert(draft(1, { filename: "note.txt", content: "text" }));
    // Clearing both fields at once is rejected before it reaches SQLite.
    expect(() => store.update(saved.id, { filename: null, content: "" })).toThrow();
    // Emptying the content is allowed while a filename remains.
    expect(store.update(saved.id, { content: "" })).toMatchObject({
      content: "",
      filename: "note.txt",
    });
    // Dropping the filename afterwards hits the table constraint, not a silent loss.
    expect(() => store.update(saved.id, { filename: null })).toThrow();
    expect(store.read(saved.id)).toMatchObject({ filename: "note.txt", content: "" });
  });

  it("searches titles and contents without distinguishing case", () => {
    store.insert(draft(1, { filename: "ÉCOLE.ts", content: "ÜBER note" }));
    store.insert(draft(2, { filename: "other.md", content: "nothing" }));
    expect(store.list({ search: "école" }).drafts).toHaveLength(1);
    expect(store.list({ search: "ÉCOLE" }).drafts).toHaveLength(1);
    expect(store.list({ search: "über NOTE" }).drafts).toHaveLength(1);
    expect(store.list({ search: "missing" }).drafts).toHaveLength(0);
  });

  it("treats LIKE wildcards in a search as literal characters", () => {
    store.insert(draft(1, { filename: "100%_ready.ts", content: "a" }));
    store.insert(draft(2, { filename: "100xready.ts", content: "a" }));
    expect(store.list({ search: "%_ready" }).drafts.map((item) => item.filename))
      .toEqual(["100%_ready.ts"]);
    expect(store.list({ search: "\\_ready" }).drafts).toHaveLength(0);
  });

  it("keeps the search index in sync after a rename or content edit", () => {
    const saved = store.insert(draft(1, { filename: "alpha.ts", content: "first" }));
    store.update(saved.id, { filename: "omega.ts" });
    expect(store.list({ search: "alpha" }).drafts).toHaveLength(0);
    expect(store.list({ search: "omega" }).drafts).toHaveLength(1);
    store.update(saved.id, { content: "rewritten" });
    expect(store.list({ search: "first" }).drafts).toHaveLength(0);
    expect(store.list({ search: "rewritten" }).drafts).toHaveLength(1);
  });

  it("matches the untitled label for unnamed drafts only", () => {
    store.insert(draft(1));
    store.insert(draft(2, { filename: "untitled-note.md", content: "b" }));
    const matches = store.list({ search: "untitled draft" }).drafts;
    expect(matches.map((item) => item.id)).toEqual([draftId(1)]);
  });

  it.each([
    ["title", "asc"],
    ["title", "desc"],
    ["createdAt", "asc"],
    ["createdAt", "desc"],
    ["updatedAt", "asc"],
    ["updatedAt", "desc"],
  ] as const)("sorts drafts by %s in %s order", (sortBy, sortOrder) => {
    const january = "2026-01-01T00:00:00.000Z";
    const february = "2026-02-01T00:00:00.000Z";
    store.insert(draft(1, { filename: "zebra.ts", createdAt: january, updatedAt: february }));
    store.insert(draft(2, { filename: "apple.ts", createdAt: february, updatedAt: january }));

    const rows = [
      { id: draftId(1), title: "zebra.ts", createdAt: january, updatedAt: february },
      { id: draftId(2), title: "apple.ts", createdAt: february, updatedAt: january },
    ];
    const key = sortBy === "title" ? "title" : sortBy;
    const expected = [...rows].sort((first, second) => {
      const compared = String(first[key]).localeCompare(String(second[key]));
      const ordered = sortOrder === "asc" ? compared : -compared;
      // Ties always break by id ascending, whichever direction is chosen.
      return ordered || first.id.localeCompare(second.id);
    });

    expect(
      store.list({ sortBy, sortOrder, pageSize: 10 }).drafts.map((item) => item.id),
    ).toEqual(expected.map((row) => row.id));
  });

  it("paginates tied values without skipping or repeating drafts", () => {
    for (const id of [12, 10, 11]) store.insert(draft(id, { filename: "Same.md" }));
    const first = store.list({ pageSize: 2, sortBy: "title" });
    const second = store.list({ pageSize: 2, sortBy: "title", cursor: first.nextCursor });
    expect([...first.drafts, ...second.drafts].map((item) => item.id))
      .toEqual([10, 11, 12].map(draftId));
    expect(second.nextCursor).toBeNull();
  });

  it("refuses a cursor from a different search or sort", () => {
    for (const id of [10, 11]) store.insert(draft(id));
    const page = store.list({ pageSize: 1 });
    expect(() => store.list({ pageSize: 1, cursor: page.nextCursor, search: "other" })).toThrow();
    expect(() => store.list({ pageSize: 1, cursor: page.nextCursor, sortBy: "title" })).toThrow();
  });

  it("hides the derived search columns from every read", () => {
    const saved = store.insert(draft(1, { filename: "hidden.ts", content: "secret text" }));
    expect(Object.keys(saved).sort()).toEqual(
      ["content", "createdAt", "filename", "id", "updatedAt"].sort(),
    );
    expect(store.list().drafts[0]).not.toHaveProperty("searchTitle");
    expect(store.list().drafts[0]).not.toHaveProperty("searchContent");
  });

  it("refuses duplicate ids and invalid filenames", () => {
    const original = draft(1);
    store.insert(original);
    expect(() => store.insert(original)).toThrow();
    expect(() => store.insert(draft(2, { filename: "   " }))).toThrow();
    expect(() => store.insert(draft(3, { filename: "nested/name.ts" }))).toThrow();
    expect(() => store.insert(draft(4, { filename: "trail ", content: "kept" }))).not.toThrow();
  });

  it("stamps updates with a fresh timestamp and preserves created", () => {
    vi.useFakeTimers({ now: new Date("2026-09-20T08:00:00.000Z") });
    const saved = store.insert(draft(1));
    const updated = store.update(saved.id, { content: "later" });
    expect(updated?.updatedAt).toBe("2026-09-20T08:00:00.000Z");
    expect(updated?.createdAt).toBe(createdAt);
    vi.useRealTimers();
  });
});
