// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  createDraftAction,
  updateDraftAction,
} from "@/features/drafts/actions/draft-actions";
import { draftSaveDebounceMs } from "@/features/drafts/constants";
import { useDraftSave, type DraftSaveInput } from "@/features/drafts/hooks/use-draft-save";
import type { DraftResponseData } from "@/features/drafts/types";

vi.mock("@/features/drafts/actions/draft-actions", () => ({
  createDraftAction: vi.fn(),
  updateDraftAction: vi.fn(),
}));

const create = vi.mocked(createDraftAction);
const update = vi.mocked(updateDraftAction);

let client: QueryClient;
let root: Root;
let isMounted = false;
let current: ReturnType<typeof useDraftSave>;
let write: () => void;

const row = (overrides: Partial<DraftResponseData> = {}): DraftResponseData => ({
  id: "00000000-0000-4000-8000-0000000000a1",
  filename: null,
  content: "draft",
  createdAt: "2026-09-18T12:00:00.000Z",
  updatedAt: "2026-09-18T12:00:00.000Z",
  ...overrides,
});

const Probe = ({ draftId }: { draftId: string | null }) => {
  current = useDraftSave(draftId);
  return null;
};

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const render = async (draftId: string | null = null) => {
  isMounted = true;
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Probe, { draftId })),
    );
  });
};

const unmount = () => {
  if (!isMounted) return;
  isMounted = false;
  act(() => root.unmount());
};

const run = async (operation: () => unknown) => {
  await act(async () => {
    await operation();
  });
  await flush();
};

/** A write that stays in flight until `release()` is called. */
const deferred = () =>
  new Promise<void>((resolve) => {
    write = resolve;
  });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  root = createRoot(document.createElement("div"));
  create.mockReset();
  update.mockReset();
  create.mockImplementation(async (input) => ({
    error: false,
    message: "Draft saved on this device.",
    data: row({ ...input, id: "00000000-0000-4000-8000-0000000000a1" }),
  }));
  update.mockImplementation(async (id, input) => ({
    error: false,
    message: "Draft saved on this device.",
    data: row({ ...input, id }),
  }));
});

afterEach(() => {
  unmount();
  client.clear();
  vi.useRealTimers();
});

describe("useDraftSave", () => {
  it("keeps an empty unnamed draft out of storage", async () => {
    await render();
    await run(() => current.save({ filename: "   ", content: "" }));
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(current.state).toBe("unsaved");
    expect(current.message).toMatch(/content or a filename/);
  });

  it("creates once, then updates the row it just made", async () => {
    await render();
    await run(() => current.save({ filename: null, content: "first" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(current.draftId).toBe("00000000-0000-4000-8000-0000000000a1");

    await run(() => current.save({ filename: null, content: "second" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-0000000000a1",
      { filename: null, content: "second" },
    );
    expect(current.state).toBe("saved");
  });

  it("normalizes the filename before writing", async () => {
    await render();
    await run(() => current.save({ filename: "  helper.ts ", content: "x" }));
    expect(create.mock.calls[0][0]).toEqual({ filename: "helper.ts", content: "x" });
  });

  it("writes only the newest buffer when edits land during a write", async () => {
    await render();
    create.mockImplementationOnce(() => deferred().then(() => ({
      error: false,
      message: "saved",
      data: row({ content: "older" }),
    })));

    act(() => current.save({ filename: null, content: "older" }));
    expect(current.state).toBe("saving");
    await run(async () => {
      current.save({ filename: null, content: "newer" });
      write();
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.any(String), {
      filename: null,
      content: "newer",
    });
    expect(current.state).toBe("saved");
  });

  it("skips a write when the buffer matches what is already stored", async () => {
    await render();
    await run(() => current.save({ filename: null, content: "same" }));
    create.mockClear();
    await run(() => current.save({ filename: null, content: "same" }));
    expect(create).not.toHaveBeenCalled();
    expect(current.state).toBe("saved");
  });

  it("reports a failed write and requeues it for retry", async () => {
    await render();
    create.mockImplementationOnce(async () => ({ error: true, message: "database is locked" }));
    await run(() => current.save({ filename: null, content: "lost" }));
    expect(current.state).toBe("error");
    expect(current.message).toBe("database is locked");

    await run(() => current.retry());
    expect(create).toHaveBeenCalledTimes(2);
    expect(current.state).toBe("saved");
    expect(current.message).toBeNull();
  });

  it("keeps an existing draft untouched when its saved row disappears", async () => {
    await render("00000000-0000-4000-8000-0000000000z9");
    update.mockImplementationOnce(async () => ({
      error: true,
      message: "This draft is not on this device.",
      code: "DRAFT_NOT_FOUND",
    }));
    await run(() => current.save({ filename: null, content: "edited" }));
    expect(current.state).toBe("error");
    expect(current.message).toMatch(/not on this device/);
    expect(create).not.toHaveBeenCalled();
  });

  it("resolves saveNow with the saved id once the newest buffer is durable", async () => {
    await render();
    create.mockImplementationOnce(() => deferred().then(() => ({
      error: false,
      message: "saved",
      data: row({ content: "flushed" }),
    })));

    let settled: string | null | undefined;
    act(() => {
      void current.saveNow({ filename: null, content: "flushed" }).then((id) => {
        settled = id;
      });
    });
    await flush();
    expect(settled).toBeUndefined();

    await run(() => write());
    expect(settled).toBe("00000000-0000-4000-8000-0000000000a1");
  });

  it("refuses to flush an unsavable buffer", async () => {
    await render();
    await run(() => current.saveNow({ filename: null, content: "" }));
    expect(create).not.toHaveBeenCalled();
  });

  it("debounces scheduled edits and keeps the last one", async () => {
    vi.useFakeTimers();
    await render();
    const edits: DraftSaveInput[] = [
      { filename: null, content: "a" },
      { filename: null, content: "ab" },
      { filename: null, content: "abc" },
    ];
    act(() => {
      for (const edit of edits) current.schedule(edit);
    });
    expect(create).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(draftSaveDebounceMs);
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ filename: null, content: "abc" });
  });

  it("publishes the saved draft so the list refreshes without a reread", async () => {
    client.setQueryData(["drafts", "infinite"], { pages: [], pageParams: [] });
    await render();
    await run(() => current.save({ filename: "note.md", content: "text" }));
    expect(
      client.getQueryData(["drafts", "detail", "00000000-0000-4000-8000-0000000000a1"]),
    ).toMatchObject({ filename: "note.md", content: "text" });
    expect(client.getQueryState(["drafts", "infinite"])?.isInvalidated).toBe(true);
  });

  it("flushes a debounced edit when the draft screen unmounts", async () => {
    vi.useFakeTimers();
    await render();
    act(() => current.schedule({ filename: null, content: "typed last" }));
    expect(create).not.toHaveBeenCalled();

    unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ filename: null, content: "typed last" });
  });

  it("reports unsaved changes until the queued write settles", async () => {
    await render();
    create.mockImplementationOnce(() => deferred().then(() => ({
      error: false,
      message: "saved",
      data: row({ content: "pending" }),
    })));
    act(() => current.save({ filename: null, content: "pending" }));
    expect(current.hasUnsavedChanges()).toBe(true);
    await run(() => write());
    expect(current.hasUnsavedChanges()).toBe(false);
  });
});
