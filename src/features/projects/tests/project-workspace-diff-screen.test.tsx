// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import WorkspaceDiffScreen from "@/app/projects/[projectId]/git/workspace-diff";
import type { ProjectCommitDetailsSchema } from "../actions/commit-details-schemas";
import type {
  ProjectRepositoryChangeSchema,
  ProjectRepositoryChangesSchema,
} from "../actions/change-schemas";

const query = vi.hoisted(() => ({
  read: vi.fn(),
  refetch: vi.fn(),
  isFetching: false,
  fetchStatus: "idle",
  refreshAfterSaves: vi.fn(),
  error: null as Error | null,
  data: undefined as ProjectRepositoryChangesSchema | undefined,
}));
const commitActions = vi.hoisted(() => ({
  copy: vi.fn(),
  openURL: vi.fn(),
  alert: vi.fn(),
}));
vi.mock("expo-linking", () => ({ openURL: commitActions.openURL }));
vi.mock("@/components/copy-button", () => ({
  CopyButton: ({
    copyText,
    children,
    accessibilityLabel,
  }: {
    copyText: string;
    children: ReactNode;
    accessibilityLabel: string;
  }) =>
    createElement(
      "button",
      {
        onClick: () => commitActions.copy(copyText),
        "aria-label": accessibilityLabel,
      },
      children,
    ),
}));
const commitQuery = vi.hoisted(() => ({
  read: vi.fn(),
  refetch: vi.fn(),
  isFetching: false,
  fetchStatus: "idle",
  error: null as Error | null,
  data: undefined as ProjectCommitDetailsSchema | null | undefined,
}));
vi.mock("@/features/projects/hooks/use-project-commit-details", () => ({
  useProjectCommitDetails: (...args: unknown[]) => {
    commitQuery.read(...args);
    return commitQuery;
  },
}));
const saves = vi.hoisted(() => ({ flushPendingSaves: vi.fn() }));
const focus = vi.hoisted(() => ({
  effect: undefined as (() => (() => void) | void) | undefined,
}));
const listWindow = vi.hoisted(() => ({ start: 0, limit: Infinity, count: 0 }));
const textMeasurements = vi.hoisted(
  () =>
    new Map<
      string,
      {
        onLayout?: (event: {
          nativeEvent: { layout: { x: number; width: number } };
        }) => void;
        onTextLayout?: (event: {
          nativeEvent: { lines: { width: number }[] };
        }) => void;
      }
    >(),
);
const textRenderCounts = vi.hoisted(() => new Map<string, number>());
vi.mock("@/features/projects/hooks/use-project-file-save", () => ({
  useProjectFileSaveRegistry: () => saves,
}));
const route = vi.hoisted(() => ({
  projectId: "11111111-1111-4111-8111-111111111111",
  commitSha: undefined as string | string[] | undefined,
  source: undefined as string | string[] | undefined,
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => route,
  useFocusEffect: (effect: () => (() => void) | void) => {
    focus.effect = effect;
  },
}));
vi.mock("@/features/projects/hooks/use-project-changes", () => ({
  useProjectChanges: (...args: unknown[]) => {
    query.read(...args);
    return query;
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 16, left: 0, right: 0 }),
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  alert: commitActions.alert,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    accessibilityLabel,
    disabled,
  }: {
    children: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      { onClick: onPress, "aria-label": accessibilityLabel, disabled },
      children,
    ),
}));
vi.mock("@/components/ui/text", () => {
  const Text = ({
    children,
    accessibilityLabel,
    className,
    accessible,
    ...props
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    className?: string;
    accessible?: boolean;
  } & {
    onLayout?: (event: {
      nativeEvent: { layout: { x: number; width: number } };
    }) => void;
    onTextLayout?: (event: {
      nativeEvent: { lines: { width: number }[] };
    }) => void;
  }) => {
    if (accessibilityLabel) {
      textMeasurements.set(accessibilityLabel, props);
      textRenderCounts.set(
        accessibilityLabel,
        (textRenderCounts.get(accessibilityLabel) ?? 0) + 1,
      );
    }
    return createElement(
      "span",
      {
        "aria-label": accessibilityLabel,
        className,
        "aria-hidden": accessible === false || undefined,
      },
      children,
    );
  };
  return { CodeText: Text, PText: Text, HeadingText: Text };
});
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name }: { name: string }) =>
    createElement("span", { "data-icon": name }),
}));
type ScrollEvent = { contentOffset: { x: number; y: number } };
type ScrollHandlers = {
  onBeginDrag?: (event: ScrollEvent) => void;
  onScroll?: (event: ScrollEvent) => void;
};
const nativeScroll = vi.hoisted(() => ({
  handlers: new WeakMap<HTMLElement, ScrollHandlers>(),
  reactions: new Set<() => void>(),
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnUI: (worklet: () => void) => worklet(),
}));
vi.mock("react-native-reanimated", async () => {
  const { useEffect, useRef } = await import("react");
  return {
    makeMutable: <T,>(initial: T) => {
      let value = initial;
      return {
        get value() {
          return value;
        },
        set value(next: T) {
          value = next;
          [...nativeScroll.reactions].forEach((reaction) => reaction());
        },
      };
    },
    useAnimatedRef: () => useRef<HTMLElement>(null),
    useAnimatedScrollHandler: (handlers: ScrollHandlers) => handlers,
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (value: unknown) => void,
    ) => {
      useEffect(() => {
        let previous: unknown;
        const reaction = () => {
          const value = prepare();
          if (value !== previous) {
            previous = value;
            react(value);
          }
        };
        nativeScroll.reactions.add(reaction);
        reaction();
        return () => {
          nativeScroll.reactions.delete(reaction);
        };
      }, [prepare, react]);
    },
    scrollTo: (ref: { current: HTMLElement | null }, x: number) => {
      if (!ref.current) return;
      ref.current.dataset.scrollX = String(x);
      // Native programmatic scroll events must not drive another synchronization loop.
      nativeScroll.handlers
        .get(ref.current)
        ?.onScroll?.({ contentOffset: { x, y: 0 } });
    },
    default: {
      ScrollView: ({
        children,
        ref,
        horizontal,
        onScroll,
        onContentSizeChange,
        contentContainerStyle,
      }: {
        children?: ReactNode;
        ref: { current: HTMLElement | null };
        horizontal?: boolean;
        onScroll: ScrollHandlers;
        onContentSizeChange?: () => void;
        contentContainerStyle?: { width?: number };
      }) => {
        useEffect(() => {
          nativeScroll.handlers.set(ref.current!, onScroll);
          onContentSizeChange?.();
        }, [ref, onScroll, onContentSizeChange, contentContainerStyle?.width]);
        return createElement(
          "div",
          {
            ref,
            "data-horizontal-scroll": horizontal || undefined,
            "data-scroll-x": "0",
          },
          children,
        );
      },
    },
  };
});
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({
    width: 390,
    height: 844,
    fontScale: 1,
    scale: 3,
  }),
  Animated: {
    Value: class {
      constructor(public value: number) {}
    },
    event: () => undefined,
    View: ({ children }: { children?: ReactNode }) =>
      createElement("div", null, children),
    ScrollView: ({
      children,
      horizontal,
    }: {
      children?: ReactNode;
      horizontal?: boolean;
    }) =>
      createElement(
        "div",
        { "data-horizontal-scroll": horizontal || undefined },
        children,
      ),
  },
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityState,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityState?: { expanded?: boolean };
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      {
        "aria-label": accessibilityLabel,
        "aria-expanded": accessibilityState?.expanded,
        onClick: onPress,
      },
      children,
    ),
  View: ({
    children,
    accessibilityLabel,
    className,
    style,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    className?: string;
    style?: { width?: number };
  }) =>
    createElement(
      "div",
      {
        "aria-label": accessibilityLabel,
        className,
        "data-width": style?.width,
      },
      children,
    ),
  ScrollView: ({
    children,
    horizontal,
  }: {
    children?: ReactNode;
    horizontal?: boolean;
  }) =>
    createElement(
      "div",
      { "data-horizontal-scroll": horizontal || undefined },
      children,
    ),
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    keyExtractor,
    onRefresh,
    refreshing,
    renderScrollComponent,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => ReactNode;
    keyExtractor: (item: unknown, index: number) => string;
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
    onRefresh?: () => void;
    refreshing?: boolean;
    renderScrollComponent?: (props: { children: ReactNode }) => ReactNode;
  }) => {
    listWindow.count = data.length;
    const content = createElement(
      "div",
      { "data-refreshing": refreshing },
      ListHeaderComponent,
      data.length
        ? data
            .slice(listWindow.start, listWindow.start + listWindow.limit)
            .map((item, index) =>
              createElement(
                "div",
                { key: keyExtractor(item, index) },
                renderItem({ item, index }),
              ),
            )
        : ListEmptyComponent,
      onRefresh &&
        createElement("button", {
          "aria-label": "Pull to refresh",
          onClick: onRefresh,
        }),
    );
    return renderScrollComponent
      ? renderScrollComponent({ children: content })
      : content;
  },
}));

const change = (
  overrides: Partial<ProjectRepositoryChangeSchema> = {},
): ProjectRepositoryChangeSchema => ({
  path: "src/live.ts",
  originalPath: null,
  indexStatus: "unchanged",
  worktreeStatus: "modified",
  isUntracked: false,
  isConflicted: false,
  kind: "file",
  headMode: "100644",
  indexMode: "100644",
  worktreeMode: "100644",
  staged: null,
  unstaged: {
    patch: "@@ -1 +1 @@\n-before\n+after\n",
    additions: 1,
    deletions: 1,
    unavailableReason: null,
  },
  ...overrides,
});
const snapshot = (changes = [change()]): ProjectRepositoryChangesSchema => ({
  repositoryState: "ready",
  currentBranch: "actual-checkout",
  headSha: "a".repeat(40),
  isDetached: false,
  observedAt: "2026-09-13T12:00:00Z",
  changes,
});

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(createElement(WorkspaceDiffScreen)));
const click = (label: string) => {
  const button = container.querySelector<HTMLButtonElement>(
    `[aria-label="${label}"]`,
  );
  expect(button).not.toBeNull();
  act(() => button!.click());
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(query, {
    data: undefined,
    error: null,
    isFetching: false,
    fetchStatus: "idle",
  });
  route.projectId = "11111111-1111-4111-8111-111111111111";
  route.commitSha = undefined;
  route.source = undefined;
  Object.assign(commitQuery, {
    data: undefined,
    error: null,
    isFetching: false,
    fetchStatus: "idle",
  });
  commitQuery.read.mockClear();
  commitQuery.refetch.mockReset().mockResolvedValue({});
  commitActions.openURL.mockReset().mockResolvedValue(true);
  query.read.mockClear();
  query.refetch.mockClear();
  saves.flushPendingSaves.mockReset().mockResolvedValue(undefined);
  query.refreshAfterSaves
    .mockReset()
    .mockImplementation(async (flush: () => Promise<void>) => {
      await flush();
      return query.refetch();
    });
  focus.effect = undefined;
  Object.assign(listWindow, { start: 0, limit: Infinity, count: 0 });
  textMeasurements.clear();
  textRenderCounts.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

it("renders only the requested line window of a large expanded diff", () => {
  const count = 10_000;
  const patch =
    `@@ -0,0 +1,${count} @@\n` +
    Array.from({ length: count }, (_, index) => `+line ${index}\n`).join("");
  query.data = snapshot([
    change({
      unstaged: {
        patch,
        additions: count,
        deletions: 0,
        unavailableReason: null,
      },
    }),
  ]);
  listWindow.limit = 12;
  render();
  expect(listWindow.count).toBe(count + 3);
  expect(container.querySelectorAll('[aria-label^="Added line"]')).toHaveLength(
    9,
  );
  expect(container.textContent).not.toContain("line 9999");
  listWindow.start = count;
  render();
  expect(container.querySelectorAll('[aria-label^="Added line"]')).toHaveLength(
    3,
  );
  expect(container.textContent).toContain("line 9999");
});

it("does not rerender unrelated visible lines when one line reports its measured width", async () => {
  const lines = Array.from(
    { length: 5 },
    (_, index) => `+line ${index}\n`,
  ).join("");
  query.data = snapshot([
    change({
      unstaged: {
        patch: `@@ -0,0 +1,5 @@\n${lines}`,
        additions: 5,
        deletions: 0,
        unavailableReason: null,
      },
    }),
  ]);
  listWindow.limit = 20;
  render();

  const unrelatedLineRenders = textRenderCounts.get("Added line 2: line 1");
  const firstLine = textMeasurements.get("Added line 1: line 0");
  expect(firstLine?.onTextLayout).toBeTypeOf("function");
  await act(async () => {
    firstLine!.onTextLayout!({ nativeEvent: { lines: [{ width: 240 }] } });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  expect(textRenderCounts.get("Added line 2: line 1")).toBe(
    unrelatedLineRenders,
  );
});

it("flushes on focus and refresh, showing pending saves and a recoverable save error", async () => {
  query.data = snapshot();
  let finishSave!: () => void;
  saves.flushPendingSaves.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  render();
  let cleanup!: (() => void) | void;
  await act(async () => {
    cleanup = focus.effect!();
  });
  expect(saves.flushPendingSaves).toHaveBeenCalledOnce();
  expect(query.refetch).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Updating changes");
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Refresh workspace diff"]',
    )?.disabled,
  ).toBe(true);
  await act(async () => finishSave());
  expect(query.refetch).toHaveBeenCalledOnce();
  saves.flushPendingSaves.mockRejectedValueOnce(
    new Error("Save failed. Open Code to retry."),
  );
  await act(async () => click("Refresh workspace diff"));
  expect(query.refetch).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Couldn’t refresh changes");
  await act(async () => click("Refresh workspace diff"));
  expect(query.refetch).toHaveBeenCalledTimes(2);
  cleanup?.();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("loads the current project's changes instead of rendering fixture files", () => {
  query.isFetching = true;
  render();
  expect(query.read).toHaveBeenCalledWith(route.projectId, { enabled: false });
  expect(container.textContent).toContain("Loading changes…");
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(container.textContent).not.toContain("project-commit-list.tsx");
  expect(container.textContent).not.toContain("No uncommitted changes");
});

it("renders backend files without branch or scope labels", async () => {
  query.data = snapshot();
  render();
  expect(container.textContent).toContain("live.ts");
  expect(container.textContent).not.toContain("actual-checkout");
  expect(container.textContent).toContain("1 file");
  expect(container.textContent).not.toContain("Unstaged");
  expect(container.textContent).toContain("@@ -1 +1 @@");
  expect(
    container.querySelector('[aria-label="Added line 1: after"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[aria-label="Removed line 1: before"]'),
  ).not.toBeNull();
  expect(container.textContent).not.toContain("project-commit-list.tsx");
  await act(async () => click("Refresh workspace diff"));
  expect(query.refetch).toHaveBeenCalledTimes(1);
});

it("keeps both comparisons of the same file and displays renames", () => {
  query.data = snapshot([
    change({
      originalPath: "src/old.ts",
      indexStatus: "renamed",
      staged: {
        patch: "@@ -1 +1 @@\n-original\n+staged\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
  ]);
  render();
  expect(container.textContent).toContain("From src/old.ts");
  expect(container.textContent).not.toContain("Staged");
  expect(container.textContent).not.toContain("Unstaged");
  expect(
    container.querySelector('[aria-label="Added line 1: staged"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[aria-label="Added line 1: after"]'),
  ).not.toBeNull();
  expect(container.textContent).toContain("1 file");
});

it("shows an initial failure with a working retry", async () => {
  query.error = new Error("Request failed");
  render();
  expect(container.textContent).toContain("Unable to load changes");
  expect(container.textContent).not.toContain("No uncommitted changes");
  await act(async () => click("Retry workspace diff"));
  expect(query.refetch).toHaveBeenCalledTimes(1);
});

it("retains the previous diff with an explicit refresh error", async () => {
  query.data = snapshot();
  query.error = new Error("Request failed");
  render();
  expect(container.textContent).toContain("Showing previously loaded changes");
  expect(container.textContent).toContain("after");
  await act(async () => click("Refresh workspace diff"));
  expect(query.refetch).toHaveBeenCalledOnce();
});

it("retains data while updating and disables duplicate refreshes", () => {
  query.data = snapshot();
  query.isFetching = true;
  render();
  expect(container.textContent).toContain("Updating changes…");
  expect(container.textContent).toContain("after");
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Refresh workspace diff"]',
    )?.disabled,
  ).toBe(true);
});

it.each([false, true])(
  "shows a paused connection with cached data=%s",
  (cached) => {
    query.data = cached ? snapshot() : undefined;
    query.fetchStatus = "paused";
    render();
    expect(container.textContent).toContain("Waiting for a connection…");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    if (cached)
      expect(container.textContent).toContain(
        "Showing previously loaded changes",
      );
    expect(container.textContent).not.toContain("No uncommitted changes");
  },
);

it.each([
  ["ready", "No uncommitted changes"],
  ["unborn", "No uncommitted changes"],
  ["not-initialized", "Git is not initialized"],
] as const)("distinguishes empty %s repositories", (repositoryState, title) => {
  query.data = { ...snapshot([]), repositoryState };
  render();
  expect(container.textContent).toContain(title);
});

it.each([
  ["binary", "Binary file"],
  ["too-large", "too large"],
  ["unsupported", "unavailable"],
  ["conflict", "Merge conflict"],
] as const)(
  "explains a %s preview while keeping the file visible",
  (unavailableReason, message) => {
    query.data = snapshot([
      change({
        unstaged: {
          patch: null,
          additions: null,
          deletions: null,
          unavailableReason,
        },
      }),
    ]);
    render();
    expect(container.textContent).toContain("live.ts");
    expect(container.textContent).toContain(message);
    expect(container.textContent).not.toContain("+0");
  },
);

it("isolates malformed patches and displays metadata-only comparisons", () => {
  query.data = snapshot([
    change({
      path: "malformed.ts",
      unstaged: {
        patch: "bad",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
    change({
      path: "executable.sh",
      worktreeMode: "100755",
      unstaged: {
        patch: "",
        additions: 0,
        deletions: 0,
        unavailableReason: null,
      },
    }),
  ]);
  render();
  expect(container.textContent).toContain("Unable to display this patch");
  expect(container.textContent).toContain("executable.sh");
  expect(container.textContent).toContain("Executable file");
  expect(container.textContent).toContain("No text changes");
});

it("renders source text without displaying Git newline metadata", () => {
  query.data = snapshot([
    change({
      unstaged: {
        patch: "@@ -1 +1 @@\n-before\n+after\n\\ No newline at end of file\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
  ]);
  render();
  expect(container.textContent).not.toContain("No newline at end of file");
  expect(
    container.querySelector('[aria-label="Added line 1: after"]'),
  ).not.toBeNull();
});

it("does not retain a previous project's parsed files when the hook data changes", () => {
  query.data = snapshot();
  render();
  route.projectId = "22222222-2222-4222-8222-222222222222";
  query.data = undefined;
  query.isFetching = true;
  render();
  expect(query.read).toHaveBeenLastCalledWith(route.projectId, {
    enabled: false,
  });
  expect(container.textContent).not.toContain("live.ts");
  expect(container.textContent).toContain("Loading changes…");
});

it("uses one line-number gutter and keeps indentation", () => {
  query.data = snapshot([
    change({
      unstaged: {
        patch: "@@ -10,2 +10,2 @@\n unchanged\n-  before\n+  after\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
  ]);
  render();
  for (const [label, number] of [
    ["Unchanged line 10: unchanged", "10"],
    ["Removed line 11:   before", "11"],
    ["Added line 11:   after", "11"],
  ]) {
    const text = container.querySelector(`[aria-label="${label}"]`)!;
    const gutters = text.parentElement!.querySelectorAll(
      '[aria-hidden="true"]',
    );
    expect(gutters).toHaveLength(1);
    expect(gutters[0].textContent).toBe(number);
  }
});

const viewportFor = (label: string) => {
  const viewport = container
    .querySelector(`[aria-label="${label}"]`)
    ?.closest<HTMLElement>('[data-horizontal-scroll="true"]');
  expect(viewport).not.toBeNull();
  return viewport!;
};
const dragCode = (label: string, x: number) => {
  const viewport = viewportFor(label);
  const event = { contentOffset: { x, y: 0 } };
  act(() => {
    nativeScroll.handlers.get(viewport)?.onBeginDrag?.(event);
    viewport.dataset.scrollX = String(x);
    nativeScroll.handlers.get(viewport)?.onScroll?.(event);
  });
};
const twoFileDiff = () =>
  snapshot([
    change({
      unstaged: {
        patch: "@@ -1,2 +1,2 @@\n unchanged\n-before\n+after\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
    change({
      path: "src/other.ts",
      unstaged: {
        patch: "@@ -1 +1 @@\n-old second file\n+new second file\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
  ]);
const measureCode = async (label: string, width: number) =>
  act(async () => {
    textMeasurements.get(label)!.onTextLayout!({
      nativeEvent: { lines: [{ width }] },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

it("scrolls every line of a file together while other files keep their own position", async () => {
  query.data = twoFileDiff();
  render();
  const hunkLabel = "Changes lines 1 through 2 to lines 1 through 2";
  await measureCode(hunkLabel, 800);
  await measureCode("Added line 2: after", 800);
  await measureCode("Added line 1: new second file", 600);
  dragCode("Added line 2: after", 160);
  for (const label of [
    hunkLabel,
    "Added line 2: after",
    "Removed line 2: before",
    "Unchanged line 1: unchanged",
  ]) {
    expect(viewportFor(label).dataset.scrollX).toBe("160");
  }
  expect(viewportFor("Added line 1: new second file").dataset.scrollX).toBe(
    "0",
  );
  dragCode("Removed line 1: old second file", 90);
  expect(viewportFor("Added line 1: new second file").dataset.scrollX).toBe(
    "90",
  );
  expect(viewportFor("Added line 2: after").dataset.scrollX).toBe("160");
  // A different line takes over the same file, including its momentum events.
  dragCode("Unchanged line 1: unchanged", 220);
  act(() =>
    nativeScroll.handlers
      .get(viewportFor("Unchanged line 1: unchanged"))
      ?.onScroll?.({ contentOffset: { x: 240, y: 0 } }),
  );
  expect(viewportFor("Added line 2: after").dataset.scrollX).toBe("240");
  expect(viewportFor("Removed line 2: before").dataset.scrollX).toBe("240");
  expect(viewportFor("Added line 1: new second file").dataset.scrollX).toBe(
    "90",
  );
  expect(
    container
      .querySelector('[aria-label="Collapse src/live.ts diff"]')
      ?.closest("[data-horizontal-scroll]"),
  ).toBeNull();
});

it("restores the file offset when virtualized lines return or a file is reopened", async () => {
  query.data = twoFileDiff();
  render();
  await measureCode("Added line 2: after", 800);
  dragCode("Removed line 2: before", 160);
  listWindow.start = 6;
  render();
  expect(
    container.querySelector('[aria-label="Added line 2: after"]'),
  ).toBeNull();
  listWindow.start = 0;
  render();
  expect(viewportFor("Added line 2: after").dataset.scrollX).toBe("160");
  click("Collapse src/live.ts diff");
  click("Expand src/live.ts diff");
  expect(viewportFor("Added line 2: after").dataset.scrollX).toBe("160");
  route.projectId = "22222222-2222-4222-8222-222222222222";
  render();
  expect(viewportFor("Added line 2: after").dataset.scrollX).toBe("0");
});

it("paints the file heading, comparison details, and code on the same card surface", () => {
  query.data = snapshot([
    change({
      unstaged: {
        patch: "@@ -1,2 +1,2 @@\n unchanged\n-before\n+after\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
  ]);
  render();
  for (const label of [
    "Collapse src/live.ts diff",
    "Unchanged line 1: unchanged",
    "Added line 2: after",
    "Removed line 2: before",
  ]) {
    expect(
      container
        .querySelector(`[aria-label="${label}"]`)
        ?.closest('[class~="bg-card/25"]'),
    ).not.toBeNull();
  }
  const status = [...container.querySelectorAll("span")].find(
    (node) => node.textContent === "Modified",
  );
  expect(status?.closest('[class~="bg-card/25"]')).not.toBeNull();
});

it("measures a common width within each file without widening unrelated files", async () => {
  query.data = twoFileDiff();
  render();
  const added = textMeasurements.get("Added line 2: after")!;
  await act(async () => {
    added.onLayout!({ nativeEvent: { layout: { x: 64, width: 5000 } } });
    added.onTextLayout!({ nativeEvent: { lines: [{ width: 550.5 }] } });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const contentWidth = (label: string) =>
    viewportFor(label)
      .querySelector("[data-width]")
      ?.getAttribute("data-width");
  expect(contentWidth("Added line 2: after")).toBe("631");
  expect(contentWidth("Removed line 2: before")).toBe("631");
  expect(contentWidth("Added line 1: new second file")).toBe("390");
  await measureCode("Removed line 2: before", 200);
  expect(contentWidth("Added line 2: after")).toBe("631");
});

it("paints row backgrounds once without a second tint behind the code", () => {
  query.data = snapshot();
  render();
  for (const label of ["Added line 1: after", "Removed line 1: before"]) {
    const text = container.querySelector(`[aria-label="${label}"]`)!;
    expect(text.parentElement!.className).toMatch(/bg-/);
    expect(text.className).not.toMatch(/bg-/);
  }
});

it("separates change markers from code without altering source indentation", () => {
  query.data = snapshot([
    change({
      unstaged: {
        patch: "@@ -1 +1 @@\n-  before\n+  after\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
  ]);
  render();
  expect(
    container.querySelector('[aria-label="Added line 1:   after"]')
      ?.textContent,
  ).toBe("+   after");
  expect(
    container.querySelector('[aria-label="Removed line 1:   before"]')
      ?.textContent,
  ).toBe("−   before");
});

it("opens all files by default and toggles each file independently", () => {
  query.data = snapshot([change(), change({ path: "src/other.ts" })]);
  render();
  expect(
    container
      .querySelector('[aria-label="Collapse src/live.ts diff"]')
      ?.getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    container.querySelectorAll('[aria-label="Added line 1: after"]'),
  ).toHaveLength(2);
  click("Collapse src/live.ts diff");
  const collapsed = container.querySelector(
    '[aria-label="Expand src/live.ts diff"]',
  );
  expect(collapsed?.getAttribute("aria-expanded")).toBe("false");
  expect(collapsed?.querySelector('[data-icon="chevron-down"]')).not.toBeNull();
  expect(
    container.querySelectorAll('[aria-label="Added line 1: after"]'),
  ).toHaveLength(1);
  click("Expand src/live.ts diff");
  expect(
    container.querySelector(
      '[aria-label="Collapse src/live.ts diff"] [data-icon="chevron-up"]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelectorAll('[aria-label="Added line 1: after"]'),
  ).toHaveLength(2);
});

it("preserves collapsed files during refresh and opens new files by default", () => {
  query.data = snapshot();
  render();
  click("Collapse src/live.ts diff");
  query.data = snapshot([change(), change({ path: "new.ts" })]);
  render();
  expect(
    container.querySelector('[aria-label="Expand src/live.ts diff"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[aria-label="Collapse new.ts diff"]'),
  ).not.toBeNull();
  expect(
    container.querySelectorAll('[aria-label="Added line 1: after"]'),
  ).toHaveLength(1);
});

it("starts expanded when switching to another project with the same filename", () => {
  query.data = snapshot();
  render();
  click("Collapse src/live.ts diff");
  route.projectId = "22222222-2222-4222-8222-222222222222";
  query.data = snapshot();
  render();
  expect(
    container.querySelector('[aria-label="Collapse src/live.ts diff"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[aria-label="Added line 1: after"]'),
  ).not.toBeNull();
});

const commitDetails = (): ProjectCommitDetailsSchema => ({
  source: "local",
  commit: {
    hash: "b".repeat(40),
    message:
      "fix: preserve editor selection\n\nKeep the active range after saving.",
    author: "Riley Chen",
    authorEmail: "riley@example.com",
    committer: "Riley Chen",
    committerEmail: "riley@example.com",
    authoredAt: "2026-09-15T12:00:00Z",
    committedAt: "2026-09-15T12:00:00Z",
    parentHashes: ["c".repeat(40)],
    isMerge: false,
  },
  baseSha: "c".repeat(40),
  githubUrl: "https://github.com/team/editor/commit/" + "b".repeat(40),
  files: [
    {
      path: "src/selection.ts",
      originalPath: null,
      status: "modified",
      beforeMode: "100644",
      afterMode: "100644",
      diff: {
        patch: "@@ -1 +1 @@\n-before\n+after\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    },
  ],
  summary: { fileCount: 1, additions: 1, deletions: 1, unavailableCount: 0 },
});
const selectCommit = () => {
  route.commitSha = "b".repeat(40);
  route.source = "local";
};

it.each(["local", "remote"] as const)(
  "renders %s server data in the existing commit layout",
  (source) => {
    selectCommit();
    route.source = source;
    commitQuery.data = { ...commitDetails(), source };
    render();
    expect(commitQuery.read).toHaveBeenCalledWith(route.projectId, {
      commitSha: route.commitSha,
      source,
    });
    expect(query.read).not.toHaveBeenCalled();
    expect(saves.flushPendingSaves).not.toHaveBeenCalled();
    expect(container.textContent).toContain("fix: preserve editor selection");
    expect(container.textContent).not.toContain(
      "Keep the active range after saving.",
    );
    expect(container.textContent).toContain("Riley Chen");
    expect(container.textContent).toContain("riley@example.com");
    expect(container.textContent).toContain("ccccccc");
    expect(container.textContent).toContain("Committed Sep 15, 2026 at");
    expect(container.textContent).not.toMatch(
      /Local commit|Remote commit|Alex Morgan|workspace startup feedback/,
    );
    expect(
      container.querySelector('[aria-label="Copy commit SHA"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="View commit on GitHub"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Refresh workspace diff"]'),
    ).toBeNull();
    expect(
      container.querySelector('[aria-label="Pull to refresh"]'),
    ).toBeNull();
    expect(
      container.querySelector('[aria-label="Added line 1: after"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="1 added lines"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("@@ -1 +1 @@");
    click("Collapse src/selection.ts diff");
    expect(
      container.querySelector('[aria-label="Expand src/selection.ts diff"]'),
    ).not.toBeNull();
  },
);

it("shows loading without sample metadata or code", () => {
  selectCommit();
  commitQuery.isFetching = true;
  render();
  expect(container.textContent).toContain("Loading commit details…");
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Copy commit SHA"]')).toBeNull();
  expect(container.querySelector('[aria-label^="Added line"]')).toBeNull();
});

it.each([undefined, null])(
  "shows a recoverable commit error when data is %s",
  async (data) => {
    selectCommit();
    commitQuery.data = data;
    commitQuery.error = new Error(
      "Unable to load commit details. Please try again.",
    );
    render();
    expect(container.textContent).toContain("Unable to load commit details");
    await act(async () => click("Retry commit details"));
    expect(commitQuery.refetch).toHaveBeenCalledOnce();
    commitQuery.isFetching = true;
    render();
    expect(container.textContent).toContain("Loading commit details…");
    expect(
      container.querySelector('[aria-label="Retry commit details"]'),
    ).toBeNull();
    commitQuery.data = commitDetails();
    commitQuery.isFetching = false;
    commitQuery.error = null;
    render();
    expect(container.textContent).toContain("Riley Chen");
  },
);

it.each([false, true])(
  "handles a paused commit read with cached data=%s",
  (cached) => {
    selectCommit();
    commitQuery.data = cached ? commitDetails() : undefined;
    commitQuery.fetchStatus = "paused";
    render();
    expect(container.textContent).toContain("Waiting for a connection…");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(
      container.querySelector('[aria-label="Retry commit details"]'),
    ).toBeNull();
    if (cached) expect(container.textContent).toContain("Riley Chen");
  },
);

it("retains loaded commit details during background refresh and offers retry on failure", async () => {
  selectCommit();
  commitQuery.data = commitDetails();
  commitQuery.isFetching = true;
  render();
  expect(container.textContent).toContain("Updating commit details…");
  expect(container.textContent).toContain("Riley Chen");
  commitQuery.isFetching = false;
  commitQuery.error = new Error("Request failed");
  render();
  expect(container.textContent).toContain(
    "Showing previously loaded commit details",
  );
  expect(
    container.querySelector('[aria-label="Added line 1: after"]'),
  ).not.toBeNull();
  await act(async () => click("Retry commit details"));
  expect(commitQuery.refetch).toHaveBeenCalledOnce();
});

it("renders root commits with no files and no GitHub URL", () => {
  selectCommit();
  const data = commitDetails();
  commitQuery.data = {
    ...data,
    commit: { ...data.commit, parentHashes: [] },
    baseSha: null,
    githubUrl: null,
    files: [],
    summary: { fileCount: 0, additions: 0, deletions: 0, unavailableCount: 0 },
  };
  render();
  expect(container.textContent).toContain("Riley Chen");
  expect(container.textContent).toContain("ParentNone");
  expect(container.textContent).toContain("0 files changed");
  expect(container.textContent).toContain("No file changes");
  expect(
    container.querySelector('[aria-label="View commit on GitHub"]'),
  ).toBeNull();
});

it("renders remote renames and unavailable diffs without inventing file modes", () => {
  selectCommit();
  route.source = "remote";
  const data = commitDetails();
  commitQuery.data = {
    ...data,
    source: "remote",
    files: [
      {
        ...data.files[0],
        status: "renamed",
        originalPath: "src/old.ts",
        beforeMode: null,
        afterMode: "100755",
        diff: {
          patch: null,
          additions: null,
          deletions: null,
          unavailableReason: "binary",
        },
      },
    ],
    summary: { fileCount: 1, additions: 0, deletions: 0, unavailableCount: 1 },
  };
  render();
  expect(container.textContent).toContain("From src/old.ts");
  expect(container.textContent).toContain("Binary file");
  expect(container.textContent).not.toContain("→");
  expect(
    container.querySelector('[aria-label="Line counts unavailable"]'),
  ).not.toBeNull();
});

it("does not carry previous metadata or collapsed state to another commit", () => {
  selectCommit();
  commitQuery.data = commitDetails();
  render();
  click("Collapse src/selection.ts diff");
  route.commitSha = "d".repeat(40);
  commitQuery.data = undefined;
  commitQuery.isFetching = true;
  render();
  expect(container.textContent).not.toContain("Riley Chen");
  const data = commitDetails();
  commitQuery.data = {
    ...data,
    commit: { ...data.commit, hash: route.commitSha, author: "Sam" },
  };
  commitQuery.isFetching = false;
  render();
  expect(container.textContent).toContain("Sam");
  expect(
    container.querySelector('[aria-label="Collapse src/selection.ts diff"]'),
  ).not.toBeNull();
});

it("shows invalid commit parameters instead of waiting forever on a disabled query", () => {
  selectCommit();
  route.commitSha = "HEAD";
  render();
  expect(container.textContent).toContain(
    "Invalid project, commit SHA, or source",
  );
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  expect(
    container.querySelector('[aria-label="Retry commit details"]'),
  ).toBeNull();
});

it.each([
  { commitSha: "a".repeat(40) },
  { source: "local" },
  { commitSha: "", source: "local" },
  { commitSha: "a".repeat(40), source: "unknown" },
  { commitSha: ["a".repeat(40), "b".repeat(40)], source: "local" },
  { commitSha: "a".repeat(40), source: ["local", "remote"] },
])(
  "keeps the workspace view for incomplete or ambiguous parameters: %j",
  (params) => {
    Object.assign(route, params);
    query.data = snapshot();
    render();
    expect(query.read).toHaveBeenCalled();
    expect(container.textContent).toContain("live.ts");
    expect(
      container.querySelector('[aria-label="Copy commit SHA"]'),
    ).toBeNull();
  },
);

it.each(["local", "remote"] as const)(
  "copies the full SHA of the loaded %s commit",
  (source) => {
    selectCommit();
    route.source = source;
    commitQuery.data = { ...commitDetails(), source };
    render();
    click("Copy commit SHA");
    expect(commitActions.copy).toHaveBeenCalledWith(
      commitQuery.data.commit.hash,
    );
  },
);

it("opens the loaded commit's GitHub URL", async () => {
  selectCommit();
  route.source = "remote";
  commitQuery.data = { ...commitDetails(), source: "remote" };
  render();
  await act(async () => click("View commit on GitHub"));
  expect(commitActions.openURL).toHaveBeenCalledWith(
    commitQuery.data.githubUrl,
  );
  expect(commitActions.alert).not.toHaveBeenCalled();
});

it("reports a failed GitHub handoff", async () => {
  selectCommit();
  commitQuery.data = commitDetails();
  render();
  commitActions.openURL.mockRejectedValue(new Error("Cannot open URL"));
  await act(async () => click("View commit on GitHub"));
  expect(commitActions.alert).toHaveBeenCalledOnce();
});

const contentWidthFor = (label: string) =>
  Number(
    viewportFor(label)
      .querySelector("[data-width]")
      ?.getAttribute("data-width"),
  );
const shortenedDiff = () =>
  snapshot([
    change({
      unstaged: {
        patch: "@@ -1,2 +1,2 @@\n unchanged\n-before\n+x\n",
        additions: 1,
        deletions: 1,
        unavailableReason: null,
      },
    }),
    twoFileDiff().changes[1],
  ]);

it("resets a refreshed file's width and offset without resetting unchanged files", async () => {
  query.data = twoFileDiff();
  render();
  await measureCode("Added line 2: after", 800);
  await measureCode("Added line 1: new second file", 600);
  dragCode("Added line 2: after", 400);
  dragCode("Added line 1: new second file", 90);
  const previousUnchangedLine = viewportFor("Unchanged line 1: unchanged");
  query.data = shortenedDiff();
  render();
  await measureCode("Added line 2: x", 40);
  expect(contentWidthFor("Added line 2: x")).toBe(390);
  expect(viewportFor("Added line 2: x").dataset.scrollX).toBe("0");
  // Even retained lines must remount and report their width for the new comparison.
  expect(viewportFor("Unchanged line 1: unchanged")).not.toBe(
    previousUnchangedLine,
  );
  expect(contentWidthFor("Added line 1: new second file")).toBe(680);
  expect(viewportFor("Added line 1: new second file").dataset.scrollX).toBe(
    "90",
  );
});

it("ignores stale measurements after a diff refresh, including when old content returns", async () => {
  query.data = twoFileDiff();
  render();
  const oldMeasurement = textMeasurements.get(
    "Added line 2: after",
  )!.onTextLayout!;
  await measureCode("Added line 2: after", 800);
  query.data = shortenedDiff();
  render();
  act(() => oldMeasurement({ nativeEvent: { lines: [{ width: 1200 }] } }));
  expect(contentWidthFor("Added line 2: x")).toBe(390);
  query.data = twoFileDiff();
  render();
  act(() => oldMeasurement({ nativeEvent: { lines: [{ width: 1200 }] } }));
  expect(contentWidthFor("Added line 2: after")).toBe(390);
  await measureCode("Added line 2: after", 500);
  expect(contentWidthFor("Added line 2: after")).toBe(580);
});

it("preserves measurements and scroll position when a refresh returns identical comparisons", async () => {
  query.data = twoFileDiff();
  render();
  await measureCode("Added line 2: after", 800);
  dragCode("Added line 2: after", 160);
  const previousLine = viewportFor("Added line 2: after");
  query.data = { ...twoFileDiff(), observedAt: "2026-09-13T13:00:00Z" };
  render();
  expect(viewportFor("Added line 2: after")).toBe(previousLine);
  expect(contentWidthFor("Added line 2: after")).toBe(880);
  expect(viewportFor("Added line 2: after").dataset.scrollX).toBe("160");
});

it("resets a changed file while collapsed and when removed then re-added", async () => {
  query.data = twoFileDiff();
  render();
  await measureCode("Added line 2: after", 800);
  dragCode("Added line 2: after", 160);
  click("Collapse src/live.ts diff");
  query.data = shortenedDiff();
  render();
  click("Expand src/live.ts diff");
  expect(contentWidthFor("Added line 2: x")).toBe(390);
  expect(viewportFor("Added line 2: x").dataset.scrollX).toBe("0");
  const oldMeasurement = textMeasurements.get("Added line 2: x")!.onTextLayout!;
  query.data = snapshot([]);
  render();
  query.data = shortenedDiff();
  render();
  act(() => oldMeasurement({ nativeEvent: { lines: [{ width: 1200 }] } }));
  expect(contentWidthFor("Added line 2: x")).toBe(390);
});
