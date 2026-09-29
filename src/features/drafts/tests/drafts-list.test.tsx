// @vitest-environment happy-dom
import {
  act,
  Children,
  cloneElement,
  createElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlatListProps } from "react-native";

import { DraftsList } from "@/features/drafts/components/drafts-list";
import DraftsScreen from "@/app/(main)/drafts";
import type { DraftFiltersProps } from "@/features/drafts/components/draft-filters";
import type { DraftResponseData } from "@/features/drafts/types";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  listProps: {} as FlatListProps<DraftResponseData>,
  useDrafts: vi.fn(),
  deletion: { isPending: false, mutateAsync: vi.fn() },
  push: vi.fn(),
  router: { push: vi.fn() },
  confirm: vi.fn(),
  alert: vi.fn(),
  showSuccess: vi.fn(),
  asset: false,
}));
vi.mock("@/features/drafts/lib/draft-assets", () => ({
  draftHasAsset: () => mocks.asset,
}));
vi.mock("@/features/projects/lib/image-files", () => ({
  isProjectImagePath: (path: string) => /\.(png|jpg|jpeg)$/i.test(path),
}));

vi.mock("@/features/drafts/hooks/use-drafts", () => ({
  useDrafts: mocks.useDrafts,
}));
vi.mock("@/features/drafts/hooks/use-delete-draft", () => ({
  useDeleteDraft: () => mocks.deletion,
}));
vi.mock("@/hooks/use-success-feedback", () => ({
  useSuccessFeedback: () => mocks.showSuccess,
}));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/drafts/components/draft-filters", () => ({
  DraftFilters: ({ filters, setFilters }: DraftFiltersProps) =>
    createElement(
      "button",
      {
        onClick: () =>
          setFilters({ search: "helper", sortBy: "title", sortOrder: "asc" }),
      },
      `Search: ${filters.search}`,
    ),
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  alert: mocks.alert,
  confirmAction: (...args: unknown[]) => mocks.confirm(...args),
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => createElement("div", { className }, children),
  Pressable: ({
    children,
    href,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    href?: string;
    accessibilityLabel?: string;
  }) =>
    createElement("a", { href, "aria-label": accessibilityLabel }, children),
  ActivityIndicator: () => createElement("progress"),
  FlatList: (props: FlatListProps<DraftResponseData>) => {
    mocks.listProps = props;
    return createElement(
      "section",
      { "data-flat-list": true },
      props.data?.length
        ? Array.from(props.data).map((item, index) =>
            createElement(
              "div",
              { key: props.keyExtractor?.(item, index) },
              props.renderItem?.({
                item,
                index,
                separators: {
                  highlight: vi.fn(),
                  unhighlight: vi.fn(),
                  updateProps: vi.fn(),
                },
              }),
            ),
          )
        : (props.ListEmptyComponent as ReactNode),
      props.ListFooterComponent as ReactNode,
    );
  },
}));
vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  default: ({
    children,
    renderRightActions,
  }: {
    children?: ReactNode;
    renderRightActions?: () => ReactNode;
  }) => createElement("div", null, children, renderRightActions?.()),
}));
vi.mock("expo-router", () => {
  const Link = ({
    children,
    href,
  }: {
    children: ReactNode;
    href: { params: { draftId: string } };
  }) =>
    cloneElement(
      Children.toArray(children)[0] as ReactElement<{ href?: string }>,
      { href: `/draft/${encodeURIComponent(href.params.draftId)}` },
    );
  return {
    useRouter: () => mocks.router,
    Link: Object.assign(Link, {
      Trigger: ({
        children,
        href,
      }: {
        children: ReactElement<{ href?: string }>;
        href?: string;
      }) => cloneElement(children, { href }),
      Menu: () => null,
      MenuAction: () => null,
    }),
  };
});
vi.mock("@/components/ui/text", () => {
  const Text = ({
    children,
    accessibilityRole,
  }: {
    children?: ReactNode;
    accessibilityRole?: string;
  }) => createElement("span", { role: accessibilityRole }, children);
  return { PText: Text, HeadingText: Text, CodeText: Text };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "button",
      { onClick: onPress, disabled, "aria-label": accessibilityLabel },
      children,
    ),
}));

const draftId = "00000000-0000-4000-8000-000000000001";
const draft = (
  overrides: Partial<DraftResponseData> = {},
): DraftResponseData => ({
  id: draftId,
  filename: "helper.ts",
  content: "export const a = 1;\nsecond line",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-07T12:00:00.000Z",
  ...overrides,
});
const page = (drafts: DraftResponseData[]) => ({ drafts, nextCursor: null });

let root: Root;
let container: HTMLDivElement;
const render = (props: ComponentProps<typeof DraftsList> = {}) =>
  act(() => root.render(createElement(DraftsList, props)));
const reachEnd = () =>
  act(() => mocks.listProps.onEndReached?.({ distanceFromEnd: 0 }));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  mocks.push.mockResolvedValue({});
  mocks.deletion.isPending = false;
  mocks.deletion.mutateAsync.mockReset();
  mocks.confirm.mockReset();
  mocks.alert.mockReset();
  mocks.showSuccess.mockReset();
  mocks.asset = false;
  mocks.query = {
    data: { pages: [page([draft()])], pageParams: [null] },
    isPending: false,
    isFetching: false,
    isRefetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    error: null,
    fetchStatus: "idle",
    hasNextPage: true,
    fetchNextPage: mocks.push,
    refetch: mocks.push,
  };
  mocks.useDrafts.mockImplementation(() => mocks.query);
});
afterEach(() => act(() => root.unmount()));

describe("DraftsList", () => {
  it("links each draft to its editor and deduplicates overlapping pages", () => {
    mocks.query.data = {
      pages: [
        page([draft()]),
        page([draft(), draft({ id: "two", filename: null, content: "b" })]),
      ],
    };
    render();
    const links = [...container.querySelectorAll("a")];
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe(`/draft/${draftId}`);
    expect(mocks.listProps.keyExtractor?.(draft(), 0)).toBe(draftId);
  });

  it("names a named draft and labels an unnamed one as Untitled Draft", () => {
    render();
    expect(container.textContent).toContain("helper.ts");
    expect(container.textContent).toContain("TypeScript");
    expect(container.textContent).toContain("export const a = 1;");
    expect(container.textContent).not.toContain("second line");

    mocks.query.data = {
      pages: [page([draft({ filename: null, content: "just an idea" })])],
    };
    render();
    expect(container.textContent).toContain("Untitled Draft");
    expect(container.textContent).toContain("Plain text");
    expect(container.querySelector("a")?.getAttribute("aria-label")).toContain(
      "Untitled Draft, Plain text",
    );
  });

  it("shows a placeholder preview when a named draft is still empty", () => {
    mocks.query.data = { pages: [page([draft({ content: "" })])] };
    render();
    expect(container.textContent).toContain("No content yet");
  });

  it("labels an imported image as a file on this device", () => {
    mocks.asset = true;
    mocks.query.data = {
      pages: [page([draft({ filename: "diagram.png", content: "" })])],
    };
    render();
    expect(container.textContent).toContain("Image on this device");
  });

  it("offers a way to start a draft when the list is empty", () => {
    const onNewDraft = vi.fn();
    mocks.query.data = { pages: [page([])] };
    render({ onNewDraft });
    expect(container.textContent).toContain("No drafts yet");
    expect(container.textContent).not.toContain("Clear search");
    act(() => {
      [...container.querySelectorAll("button")]
        .find((node) => node.textContent === "New draft")!
        .click();
    });
    expect(onNewDraft).toHaveBeenCalledOnce();
  });

  it("offers to clear a search instead of creating a draft", () => {
    const onClearSearch = vi.fn();
    mocks.query.data = { pages: [page([])] };
    render({
      filters: { search: "helper" },
      onClearSearch,
      onNewDraft: vi.fn(),
    });
    expect(container.textContent).toContain("No matching drafts");
    act(() => {
      [...container.querySelectorAll("button")]
        .find((node) => node.textContent === "Clear search")!
        .click();
    });
    expect(onClearSearch).toHaveBeenCalledOnce();
  });

  it("keeps the loading state apart from an empty list", () => {
    mocks.query.isPending = true;
    mocks.query.data = undefined;
    render();
    expect(container.textContent).toContain("Loading drafts…");
    expect(container.querySelector("progress")).not.toBeNull();
  });

  it("loads the next page once and refuses while a fetch is in flight", () => {
    const fetchNextPage = vi.fn().mockResolvedValue({});
    mocks.query.fetchNextPage = fetchNextPage;
    render();
    reachEnd();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    mocks.query.isFetching = true;
    render();
    reachEnd();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    mocks.query.isFetching = false;
    mocks.query.hasNextPage = false;
    render();
    reachEnd();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("retries the failed request kind", () => {
    mocks.query.error = new Error("Unable to read drafts.");
    mocks.query.isFetchNextPageError = true;
    render();
    expect(container.textContent).toContain("Unable to read drafts.");
    act(() => {
      [...container.querySelectorAll("button")]
        .find((node) => node.textContent === "Try again")!
        .click();
    });
    expect(mocks.push).toHaveBeenCalled();
  });

  it("confirms, then deletes a draft from the list", async () => {
    render();
    const deleteButton = [...container.querySelectorAll("button")].find(
      (node) => node.getAttribute("aria-label")?.startsWith("Delete "),
    )!;
    await act(async () => {
      deleteButton.click();
    });
    expect(mocks.confirm).toHaveBeenCalledWith(
      "Delete draft?",
      expect.stringContaining("helper.ts"),
      expect.objectContaining({ actionText: "Delete" }),
    );
    const options = mocks.confirm.mock.calls[0][2] as {
      onConfirmPress: () => Promise<void>;
    };
    mocks.deletion.mutateAsync.mockResolvedValue(draft());
    await act(async () => {
      await options.onConfirmPress();
    });
    expect(mocks.deletion.mutateAsync).toHaveBeenCalledWith(draftId);
    expect(mocks.showSuccess).toHaveBeenCalledWith("Draft deleted");
  });

  it("reports a delete failure instead of pretending it succeeded", async () => {
    render();
    const deleteButton = [...container.querySelectorAll("button")].find(
      (node) => node.getAttribute("aria-label")?.startsWith("Delete "),
    )!;
    act(() => deleteButton.click());
    const options = mocks.confirm.mock.calls[0][2] as {
      onConfirmPress: () => Promise<void>;
    };
    mocks.deletion.mutateAsync.mockRejectedValue(
      new Error("database is locked"),
    );
    await act(async () => {
      await options.onConfirmPress();
    });
    expect(mocks.alert).toHaveBeenCalledWith("database is locked");
    expect(mocks.showSuccess).not.toHaveBeenCalled();
  });

  it("disables a draft's actions while its deletion is running", () => {
    mocks.deletion.isPending = true;
    render();
    const actions = [...container.querySelectorAll("button")].filter((node) =>
      node.getAttribute("aria-label")?.match(/^(Delete|Copy) /),
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((node) => node.disabled)).toBe(true);
  });
});

describe("DraftsScreen", () => {
  it("opens a blank draft from the empty list", () => {
    mocks.query.data = { pages: [page([])] };
    act(() => root.render(createElement(DraftsScreen)));
    const button = [...container.querySelectorAll("button")].find(
      (node) => node.textContent === "New draft",
    )!;
    act(() => button.click());
    expect(mocks.router.push).toHaveBeenCalledWith({
      pathname: "/draft/[draftId]",
      params: { draftId: "new" },
    });
  });

  it("passes a search clear through the filters hook", () => {
    act(() => root.render(createElement(DraftsScreen)));
    const filters = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.startsWith("Search:"),
    )!;
    act(() => filters.click());
    expect(mocks.useDrafts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "helper",
        sortBy: "title",
        sortOrder: "asc",
      }),
    );
  });
});
