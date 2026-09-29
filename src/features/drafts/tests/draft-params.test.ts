import { describe, expect, it } from "vitest";

import {
  draftCursorSchema,
  draftCursorTokenSchema,
  draftParamsSchema,
  readDraftCursor,
} from "../lib/draft-params";

const cursor = {
  version: 1 as const,
  id: "00000000-0000-4000-8000-000000000001",
  value: "2026-09-19T12:00:00.000Z",
  search: "",
  sortBy: "updatedAt" as const,
  sortOrder: "desc" as const,
};

describe("draft list parameters", () => {
  it("applies the defaults a fresh drafts screen expects", () => {
    expect(draftParamsSchema.parse({})).toEqual({
      search: "",
      sortBy: "updatedAt",
      sortOrder: "desc",
      cursor: undefined,
      pageSize: 20,
    });
  });

  it("trims a search and rejects an over-long one", () => {
    expect(draftParamsSchema.parse({ search: "  helper  " }).search).toBe("helper");
    expect(draftParamsSchema.safeParse({ search: "x".repeat(201) }).success).toBe(false);
  });

  it.each([["name"], ["filename "], ["updated"], [1], [null]])(
    "rejects the unsupported sort field %s",
    (sortBy) => {
      expect(draftParamsSchema.safeParse({ sortBy }).success).toBe(false);
    },
  );

  it.each([["ascending"], ["ASC"], [""]])("rejects the unsupported sort order %s", (sortOrder) => {
    expect(draftParamsSchema.safeParse({ sortOrder }).success).toBe(false);
  });

  it("keeps a title cursor for a non-datetime value", () => {
    const position = { ...cursor, sortBy: "title" as const, value: "helper.ts" };
    expect(draftCursorSchema.parse(position)).toEqual(position);
    expect(readDraftCursor(JSON.stringify(position))).toEqual(position);
  });

  it("rejects a datetime sort carrying a non-timestamp value", () => {
    expect(
      draftCursorSchema.safeParse({ ...cursor, value: "helper.ts" }).success,
    ).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["non-json", "{oops"],
    ["oversized", `${"x".repeat(4097)}`],
    ["wrong version", JSON.stringify({ ...cursor, version: 2 })],
    ["non-uuid id", JSON.stringify({ ...cursor, id: "draft-1" })],
    ["extra key", JSON.stringify({ ...cursor, unexpected: true })],
  ])("refuses the %s cursor token", (_label, token) => {
    expect(readDraftCursor(token)).toBeNull();
    expect(draftCursorTokenSchema.safeParse(token).success).toBe(false);
  });

  it("accepts only a token that round-trips through the cursor schema", () => {
    const token = JSON.stringify(cursor);
    expect(draftParamsSchema.parse({ cursor: token }).cursor).toBe(token);
  });

  it("refuses a cursor that no longer matches the search or sort", () => {
    const token = JSON.stringify(cursor);
    expect(
      draftParamsSchema.safeParse({ cursor: token, search: "changed" }).success,
    ).toBe(false);
    expect(
      draftParamsSchema.safeParse({ cursor: token, sortBy: "title", sortOrder: "asc" })
        .success,
    ).toBe(false);
    expect(draftParamsSchema.safeParse({ cursor: token }).success).toBe(true);
  });

  it("rejects unknown keys and out-of-range page sizes", () => {
    expect(draftParamsSchema.safeParse({ unexpected: 1 }).success).toBe(false);
    expect(draftParamsSchema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(draftParamsSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
