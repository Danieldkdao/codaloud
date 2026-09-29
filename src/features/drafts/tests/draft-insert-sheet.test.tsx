// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DraftInsertSheet } from "@/features/drafts/components/draft-insert-sheet";
import type { DraftPageData, DraftResponseData } from "@/features/drafts/types";
import type { DraftInsertMode } from "@/features/drafts/constants";

const mocks = vi.hoisted(() => ({
  useDrafts: vi.fn(),
  deletion: { isPending: false, mutateAsync: vi.fn() },
  query: {} as Record<string, unknown>,
  inputs: [] as Record<string, unknown>[],
  sheets: [] as { open: boolean; onOpenChange?: (open: boolean) => void }[],
}));

vi.mock("@/features/drafts/hooks/use-drafts", () => ({
  useDrafts: mocks.useDrafts,
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  useEditorPreferences: () => ({ preferences: { font: "JetBrains Mono" } }),
}));
vi.mock("@/features/drafts/hooks/use-delete-draft", () => ({
  useDeleteDraft: () => mocks.deletion,
}));
vi.mock("@/components/ui/content-sheet", () => ({
  ContentSheet: (props: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: ReactNode;
  }) => {
    mocks.sheets.push(props);
    return props.open
      ? createElement("div", { "data-sheet": true }, props.children)
      : null;
  },
}));
vi.mock("@/components/search-input", () => ({
  SearchInput: (props: Record<string, unknown>) => {
    mocks.inputs.push(props);
    return createElement("input", { "data-search": true });
  },
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => {
    mocks.inputs.push(props);
    return createElement("textarea", { "data-draft-body": true });
  },
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  alert: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => createElement("div", { className }, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-scroll": true }, children),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "button",
      { onClick: onPress, "aria-label": accessibilityLabel },
      children,
    ),
  ActivityIndicator: () => createElement("progress"),
}));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children);
  return { PText: Text, HeadingText: Text };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, children),
}));

const draftId = "00000000-0000-4000-8000-0000000000b1";
const draft = (
  overrides: Partial<DraftResponseData> = {},
): DraftResponseData => ({
  id: draftId,
  filename: "helper.ts",
  content: "alpha\nbeta\ngamma",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-07T12:00:00.000Z",
  ...overrides,
});

let root: Root;
let container: HTMLDivElement;
let applied: [string, string][];
let onApply: (text: string, mode: DraftInsertMode) => Promise<void>;

const render = (props: Partial<ComponentProps<typeof DraftInsertSheet>> = {}) =>
  act(() =>
    root.render(
      createElement(DraftInsertSheet, {
        open: true,
        onOpenChange: vi.fn(),
        projectSelection: null,
        onApply,
        ...props,
      }),
    ),
  );

const click = async (label: string | RegExp) => {
  const node = [...container.querySelectorAll("button")].find((candidate) => {
    const text = candidate.textContent ?? "";
    const aria = candidate.getAttribute("aria-label") ?? "";
    return typeof label === "string"
      ? text.includes(label) || aria.includes(label)
      : label.test(aria) || label.test(text);
  });
  if (!node) throw new Error(`No button matching ${label}`);
  // Applying a draft awaits the editor flush, so give the promise chain a turn.
  await act(async () => {
    node.click();
    await Promise.resolve();
    await Promise.resolve();
  });
  return node;
};

/** Drives the native selection callback on the rendered draft body. */
const selectRange = (start: number, end: number) => {
  const input = mocks.inputs.find((item) => item.onSelectionChange) as {
    onSelectionChange: (event: {
      nativeEvent: { selection: { start: number; end: number } };
    }) => void;
  };
  act(() =>
    input.onSelectionChange({ nativeEvent: { selection: { start, end } } }),
  );
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  mocks.inputs.length = 0;
  mocks.sheets.length = 0;
  applied = [];
  onApply = vi.fn(async (text: string, mode: DraftInsertMode) => {
    applied.push([text, mode]);
  });
  mocks.deletion.isPending = false;
  mocks.deletion.mutateAsync = vi.fn().mockResolvedValue(draftId);
  const page: DraftPageData = { drafts: [draft()], nextCursor: null };
  mocks.query = {
    data: { pages: [page], pageParams: [null] },
    isPending: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn().mockResolvedValue({}),
    hasNextPage: false,
    isFetchingNextPage: false,
  };
  mocks.useDrafts.mockImplementation(() => mocks.query);
});

afterEach(() => act(() => root.unmount()));

describe("DraftInsertSheet", () => {
  it("searches the draft list with the typed term", async () => {
    render();
    const search = mocks.inputs.find((item) => item.onValueChange) as {
      onValueChange: (value: string) => void;
    };
    act(() => search.onValueChange("helper"));
    expect(mocks.useDrafts).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "helper" }),
    );
    expect(container.textContent).toContain("helper.ts");
  });

  it("inserts the entire draft at the cursor when the project has no selection", async () => {
    render();
    await click("Insert from helper.ts");
    await click("Entire draft");
    expect(onApply).toHaveBeenCalledWith("alpha\nbeta\ngamma", "cursor");
    expect(container.textContent).toContain("Inserted entire draft.");
  });

  it("keeps selected text out of reach until the user selects some", async () => {
    render();
    await click("Insert from helper.ts");
    const scoped = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.includes("Selected text"),
    )!;
    expect(scoped.disabled).toBe(true);

    selectRange(0, 5);
    await click("Selected text");
    expect(onApply).toHaveBeenCalledWith("alpha", "cursor");
    expect(container.textContent).toContain("Inserted selected text.");
  });

  it("lets the user edit the excerpt before choosing it", async () => {
    render();
    await click("Insert from helper.ts");
    const body = mocks.inputs.find((item) => item.onChangeText) as {
      onChangeText: (value: string) => void;
    };
    act(() => body.onChangeText("  spaced  "));
    selectRange(2, 8);
    await click("Selected text");
    expect(onApply).toHaveBeenCalledWith("spaced", "cursor");
  });

  it("asks where the text goes when the project file has a selection", async () => {
    render({ projectSelection: { from: 4, to: 12 } });
    await click("Insert from helper.ts");
    await click("Entire draft");
    expect(container.textContent).toContain("Where should it go?");
    expect(onApply).not.toHaveBeenCalled();

    await click("Insert after selection");
    expect(onApply).toHaveBeenCalledWith(
      "alpha\nbeta\ngamma",
      "after-selection",
    );
  });

  it("offers replace as the destructive choice", async () => {
    render({ projectSelection: { from: 4, to: 12 } });
    await click("Insert from helper.ts");
    await click("Entire draft");
    await click("Replace selection");
    expect(onApply).toHaveBeenCalledWith(
      "alpha\nbeta\ngamma",
      "replace-selection",
    );
  });

  it("returns to the draft when the user backs out of the mode step", async () => {
    render({ projectSelection: { from: 4, to: 12 } });
    await click("Insert from helper.ts");
    await click("Entire draft");
    await click("Back");
    expect(container.textContent).toContain("Entire draft");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("refuses an empty draft without calling the editor", async () => {
    mocks.query.data = {
      pages: [{ drafts: [draft({ content: "" })], nextCursor: null }],
    };
    render();
    await click(/Insert from/);
    await click("Entire draft");
    expect(container.textContent).toContain("That draft text is empty.");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("surfaces a failed insert and keeps the draft open for a retry", async () => {
    onApply = vi.fn(async () => {
      throw new Error("Couldn't save this file.");
    });
    render();
    await click("Insert from helper.ts");
    await click("Entire draft");
    expect(container.textContent).toContain("Couldn't save this file.");
    expect(container.textContent).not.toContain("Inserted");
  });

  it("only offers deletion after a successful insert", async () => {
    render();
    expect(container.textContent).not.toContain("Delete draft");
    await click("Insert from helper.ts");
    expect(container.textContent).not.toContain("Delete draft");
    await click("Entire draft");
    expect(container.textContent).toContain("Delete draft");
  });

  it("keeps the draft and closes the sheet", async () => {
    const onOpenChange = vi.fn();
    render({ onOpenChange });
    await click("Insert from helper.ts");
    await click("Entire draft");
    await click("Keep draft");
    expect(mocks.deletion.mutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("deletes the source draft once the copy succeeded", async () => {
    const onOpenChange = vi.fn();
    render({ onOpenChange });
    await click("Insert from helper.ts");
    await click("Entire draft");
    await click("Delete draft");
    expect(mocks.deletion.mutateAsync).toHaveBeenCalledWith(draftId);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports a delete failure without closing the sheet", async () => {
    mocks.deletion.mutateAsync = vi
      .fn()
      .mockRejectedValue(new Error("database is locked"));
    render();
    await click("Insert from helper.ts");
    await click("Entire draft");
    await act(async () => {
      await click("Delete draft");
      await Promise.resolve();
    });
    expect(mocks.sheets.at(-1)?.open).toBe(true);
  });

  it("switches the list to a search-aware empty state", async () => {
    mocks.query.data = { pages: [{ drafts: [], nextCursor: null }] };
    render();
    expect(container.textContent).toContain("No drafts yet");
    const search = mocks.inputs.find((item) => item.onValueChange) as {
      onValueChange: (value: string) => void;
    };
    act(() => {
      search.onValueChange("nothing");
    });
    expect(container.textContent).toContain("No drafts match that search.");
  });

  it("loads more drafts on request", async () => {
    mocks.query.hasNextPage = true;
    render();
    await click("Load more drafts");
    expect(mocks.query.fetchNextPage).toHaveBeenCalled();
  });

  it("starts over when the user chooses another draft", async () => {
    render({ projectSelection: { from: 1, to: 3 } });
    await click("Insert from helper.ts");
    await click("Choose another draft");
    expect(container.textContent).toContain("Insert code from draft");
    expect(onApply).not.toHaveBeenCalled();
  });
});
