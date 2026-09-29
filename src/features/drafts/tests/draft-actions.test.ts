import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDraftAction,
  deleteDraftAction,
  readDraftAction,
  readDraftsAction,
  updateDraftAction,
} from "../actions/draft-actions";
import type { DraftResponseData } from "../types";

const store = vi.hoisted(() => ({
  read: vi.fn(),
  list: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../local/access", () => ({
  getLocalDrafts: async () => store,
}));

vi.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-0000000000ab",
}));

const draftId = "00000000-0000-4000-8000-000000000001";
const saved = (overrides: Partial<DraftResponseData> = {}): DraftResponseData => ({
  id: draftId,
  filename: "helper.ts",
  content: "const a = 1;",
  createdAt: "2026-09-18T12:00:00.000Z",
  updatedAt: "2026-09-18T12:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  store.read.mockReset();
  store.list.mockReset();
  store.insert.mockReset();
  store.update.mockReset();
  store.remove.mockReset();
  store.insert.mockImplementation((draft) => draft);
  store.update.mockImplementation((id, input) => saved({ ...input, id }));
});

afterEach(() => vi.useRealTimers());

describe("readDraftAction", () => {
  it("reads a normalized id and returns the stored row", async () => {
    store.read.mockReturnValue(saved());
    await expect(readDraftAction(draftId.toUpperCase())).resolves.toEqual(saved());
    expect(store.read).toHaveBeenCalledWith(draftId);
  });

  it("returns null for a non-uuid id, an aborted signal, and a storage failure", async () => {
    const controller = new AbortController();
    controller.abort();
    store.read.mockReturnValue(saved());
    await expect(readDraftAction("not-a-uuid")).resolves.toBeNull();
    await expect(readDraftAction(draftId, controller.signal)).resolves.toBeNull();
    store.read.mockImplementation(() => {
      throw new Error("database is locked");
    });
    await expect(readDraftAction(draftId)).resolves.toBeNull();
  });

  it("returns null rather than an error object when the draft is gone", async () => {
    store.read.mockReturnValue(null);
    await expect(readDraftAction(draftId)).resolves.toBeNull();
  });
});

describe("readDraftsAction", () => {
  it("validates params before querying and returns the page unchanged", async () => {
    const page = { drafts: [saved()], nextCursor: null };
    store.list.mockReturnValue(page);
    await expect(readDraftsAction({ search: "  helper  " })).resolves.toEqual(page);
    expect(store.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: "helper" }),
    );
  });

  it("returns an empty page instead of failing", async () => {
    store.list.mockReturnValue({ drafts: [], nextCursor: null });
    await expect(readDraftsAction({ search: "nothing" })).resolves.toEqual({
      drafts: [],
      nextCursor: null,
    });
  });

  it("returns null on invalid params, abort, and storage failure", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readDraftsAction({ pageSize: 0 })).resolves.toBeNull();
    store.list.mockReturnValue({ drafts: [], nextCursor: null });
    await expect(readDraftsAction({}, controller.signal)).resolves.toBeNull();
    store.list.mockImplementation(() => {
      throw new Error("no such table");
    });
    await expect(readDraftsAction()).resolves.toBeNull();
  });
});

describe("createDraftAction", () => {
  it("saves a draft with content only, leaving the filename unset", async () => {
    const created = await createDraftAction({ filename: null, content: "notes" });
    expect(created).toMatchObject({ error: false, message: "Draft saved on this device." });
    expect(store.insert.mock.calls[0][0]).toMatchObject({
      id: "00000000-0000-4000-8000-0000000000ab",
      filename: null,
      content: "notes",
    });
  });

  it("saves a named empty draft because a name alone earns a row", async () => {
    const created = await createDraftAction({ filename: "  idea.md  ", content: "" });
    expect(created).toMatchObject({ error: false, data: { filename: "idea.md" } });
    expect(store.insert.mock.calls[0][0].filename).toBe("idea.md");
  });

  it("refuses to create an empty unnamed draft without touching storage", async () => {
    const created = await createDraftAction({ filename: "   ", content: "" });
    expect(created.error).toBe(true);
    if (created.error) expect(created.message).toMatch(/content or a filename/i);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("refuses a path-like filename and oversized content", async () => {
    await expect(createDraftAction({ filename: "../escape.ts", content: "x" })).resolves.toMatchObject({ error: true });
    await expect(
      createDraftAction({ filename: null, content: "x".repeat(256 * 1024 + 1) }),
    ).resolves.toMatchObject({ error: true });
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("reports a storage failure as an error result", async () => {
    store.insert.mockImplementation(() => {
      throw new Error("CHECK constraint failed");
    });
    await expect(createDraftAction({ filename: null, content: "x" })).resolves.toMatchObject({
      error: true,
      message: "CHECK constraint failed",
    });
  });
});

describe("updateDraftAction", () => {
  it("forwards only the fields the caller provided", async () => {
    await updateDraftAction(draftId, { content: "new" });
    expect(store.update).toHaveBeenCalledWith(draftId, { content: "new" });
  });

  it("normalizes a filename and keeps an explicit null to clear it", async () => {
    await updateDraftAction(draftId, { filename: "  renamed.ts  " });
    expect(store.update).toHaveBeenLastCalledWith(draftId, { filename: "renamed.ts" });
    await updateDraftAction(draftId, { filename: null, content: "kept" });
    expect(store.update).toHaveBeenLastCalledWith(draftId, { filename: null, content: "kept" });
  });

  it("refuses an empty update and one that would leave the draft unsavable", async () => {
    await expect(updateDraftAction(draftId, {})).resolves.toMatchObject({ error: true });
    await expect(updateDraftAction(draftId, { filename: null, content: "" })).resolves.toMatchObject({
      error: true,
    });
    expect(store.update).not.toHaveBeenCalled();
  });

  it("reports a missing draft with a stable code", async () => {
    store.update.mockReturnValue(null);
    await expect(updateDraftAction(draftId, { content: "x" })).resolves.toMatchObject({
      error: true,
      code: "DRAFT_NOT_FOUND",
    });
  });

  it("refuses a malformed id before reaching the store", async () => {
    await expect(updateDraftAction("../x", { content: "x" })).resolves.toMatchObject({
      error: true,
    });
    expect(store.update).not.toHaveBeenCalled();
  });
});

describe("deleteDraftAction", () => {
  it("deletes an existing draft", async () => {
    store.remove.mockReturnValue(saved());
    await expect(deleteDraftAction(draftId)).resolves.toEqual({
      error: false,
      message: "Draft deleted from this device.",
    });
    expect(store.remove).toHaveBeenCalledWith(draftId);
  });

  it("reports a draft that is already gone", async () => {
    store.remove.mockReturnValue(null);
    await expect(deleteDraftAction(draftId)).resolves.toMatchObject({
      error: true,
      code: "DRAFT_NOT_FOUND",
    });
  });

  it("refuses a malformed id", async () => {
    await expect(deleteDraftAction("nope")).resolves.toMatchObject({ error: true });
    expect(store.remove).not.toHaveBeenCalled();
  });
});
