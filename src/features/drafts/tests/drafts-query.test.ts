// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  deleteDraftAction,
  readDraftAction,
  readDraftsAction,
} from "@/features/drafts/actions/draft-actions";
import { useDraft } from "@/features/drafts/hooks/use-draft";
import { useDrafts } from "@/features/drafts/hooks/use-drafts";
import { useDeleteDraft } from "@/features/drafts/hooks/use-delete-draft";
import type { DraftPageData, DraftResponseData } from "@/features/drafts/types";

vi.mock("@/features/drafts/actions/draft-actions", () => ({
  readDraftsAction: vi.fn(),
  readDraftAction: vi.fn(),
  deleteDraftAction: vi.fn(),
}));

const list = vi.mocked(readDraftsAction);
const read = vi.mocked(readDraftAction);
const remove = vi.mocked(deleteDraftAction);

let client: QueryClient;
let root: Root;
let drafts: ReturnType<typeof useDrafts> | undefined;
let draft: ReturnType<typeof useDraft> | undefined;
let deletion: ReturnType<typeof useDeleteDraft> | undefined;

const first = "00000000-0000-4000-8000-000000000001";
const row = (overrides: Partial<DraftResponseData> = {}): DraftResponseData => ({
  id: first,
  filename: "helper.ts",
  content: "const a = 1;",
  createdAt: "2026-09-18T12:00:00.000Z",
  updatedAt: "2026-09-18T12:00:00.000Z",
  ...overrides,
});
const page = (ids: string[], nextCursor: string | null = null): DraftPageData => ({
  drafts: ids.map((id) => row({ id })),
  nextCursor,
});

const token = (id: string) =>
  JSON.stringify({
    version: 1,
    id,
    value: "2026-09-18T12:00:00.000Z",
    search: "",
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

const Probe = () => {
  drafts = { ...useDrafts({ pageSize: 2 }) };
  draft = { ...useDraft(enabledDraftId.current) };
  deletion = useDeleteDraft();
  return null;
};
const enabledDraftId = { current: first as string | null };

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const render = async () => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe)));
  });
  await flush();
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  root = createRoot(document.createElement("div"));
  list.mockReset();
  read.mockReset();
  remove.mockReset();
  enabledDraftId.current = first;
  list.mockResolvedValue(page([first]));
  read.mockResolvedValue(row());
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

describe("useDrafts", () => {
  it("pages the cursor until the store stops handing one out", async () => {
    const second = "00000000-0000-4000-8000-000000000002";
    const nextToken = token(second);
    list
      .mockResolvedValueOnce(page([first], nextToken))
      .mockResolvedValueOnce(page([second]));
    await render();
    expect(drafts?.data?.pages[0].drafts).toHaveLength(1);
    await act(async () => {
      await drafts?.fetchNextPage();
    });
    await flush();
    expect(drafts?.hasNextPage).toBe(false);
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: nextToken, pageSize: 2 }),
      expect.any(AbortSignal),
    );
  });

  it("surfaces a read failure as a query error instead of an empty list", async () => {
    list.mockResolvedValue(null);
    await render();
    expect(drafts?.isError).toBe(true);
    expect(drafts?.error?.message).toBe("Unable to load drafts. Please try again.");
  });

  it("keeps an empty result as an empty list rather than an error", async () => {
    list.mockResolvedValue(page([]));
    await render();
    expect(drafts?.data?.pages[0].drafts).toEqual([]);
    expect(drafts?.isError).toBe(false);
  });

  it("never queries SQLite while the draft id is unknown", async () => {
    enabledDraftId.current = null;
    await render();
    expect(read).not.toHaveBeenCalled();
    expect(draft?.isEnabled).toBe(false);
  });

  it("reports a missing draft as an error a screen can retry", async () => {
    read.mockResolvedValue(null);
    await render();
    expect(draft?.isError).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("useDeleteDraft", () => {
  it("drops the detail cache and invalidates lists for the deleted draft", async () => {
    client.setQueryData(["drafts", "detail", first], row());
    client.setQueryData(["drafts", "infinite"], { pages: [], pageParams: [] });
    remove.mockResolvedValue({ error: false, message: "Draft deleted from this device." });
    await render();
    const readsBefore = read.mock.calls.length;
    await act(async () => {
      await deletion?.mutateAsync(first);
    });
    await flush();
    // The mounted reader refetches because onSuccess removed its cached row.
    expect(read.mock.calls.length).toBeGreaterThan(readsBefore);
    expect(client.getQueryState(["drafts", "infinite"])?.isInvalidated).toBe(true);
  });

  it("rejects with the action message and leaves caches alone", async () => {
    client.setQueryData(["drafts", "detail", first], row());
    remove.mockResolvedValue({ error: true, message: "This draft is not on this device." });
    await render();
    await expect(deletion?.mutateAsync(first)).rejects.toThrow(
      "This draft is not on this device.",
    );
    expect(client.getQueryData(["drafts", "detail", first])).toMatchObject({ id: first });
  });
});
