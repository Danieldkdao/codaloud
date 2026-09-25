// @vitest-environment happy-dom
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeContentSheet } from "@/components/ui/native-content-sheet";
import { EditorSearchBar } from "../components/editor-search-bar";
import { EditorProblemsSheet } from "../components/editor-problems-sheet";
import type { EditorSearchQuery } from "../types";
const keyboard = vi.hoisted(() => ({
  frame: undefined as { screenY: number } | undefined,
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => keyboard.frame,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { absoluteFill: {} },
  KeyboardAvoidingView: ({
    children,
    style,
    behavior,
  }: {
    children?: ReactNode;
    style: object;
    behavior?: string;
  }) =>
    createElement(
      "div",
      {
        "data-problems-layout": true,
        "data-keyboard-behavior": behavior,
        style,
      },
      children,
    ),
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-scroll": true }, children),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    disabled,
    className,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    disabled?: boolean;
    className?: string;
  }) =>
    createElement(
      "button",
      {
        onClick: onPress,
        "aria-label": accessibilityLabel,
        disabled,
        className,
      },
      children,
    ),
  FlatList: ({
    data,
    renderItem,
    ListEmptyComponent,
  }: {
    data: unknown[];
    renderItem: (args: { item: unknown }) => ReactNode;
    ListEmptyComponent: ReactNode;
  }) =>
    createElement(
      "div",
      { "data-list": true },
      data.length
        ? data.map((item, index) =>
            createElement("div", { key: index }, renderItem({ item })),
          )
        : ListEmptyComponent,
    ),
  useWindowDimensions: () => ({ height: 844, width: 390 }),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "background" }));
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: { children?: ReactNode }) =>
    createElement("h2", null, children),
  PText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChangeText,
    accessibilityLabel,
    containerClassName,
  }: {
    value: string;
    containerClassName?: string;
    onChangeText: (value: string) => void;
    accessibilityLabel: string;
  }) =>
    createElement("input", {
      value,
      "data-container-class": containerClassName,
      "aria-label": accessibilityLabel,
      onInput: (event) => onChangeText(event.currentTarget.value),
    }),
}));
vi.mock("@/components/ui/content-sheet", () => ({
  ContentSheet: NativeContentSheet,
}));
vi.mock("react-native-screens", () => ({
  ScreenStack: ({ children }: { children?: ReactNode }) => children,
  ScreenStackItem: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 50, bottom: 34, left: 0, right: 0 }),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  keyboard.frame = undefined;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});
const click = (label: string) =>
  act(() => {
    const button = [...container.querySelectorAll("button")].find(
      (item) => (item.getAttribute("aria-label") ?? item.textContent) === label,
    );
    expect(button).toBeDefined();
    button!.click();
  });
it("toggles replacement and search options without dropping either input", () => {
  const command = vi.fn();
  let query!: EditorSearchQuery;
  const Probe = () => {
    const [value, setValue] = useState<EditorSearchQuery>({
      search: "old",
      replace: "new",
    });
    const [replace, setReplace] = useState(false);
    query = value;
    return createElement(EditorSearchBar, {
      query: value,
      onChange: setValue,
      replace,
      onReplaceChange: setReplace,
      onCommand: command,
      onClose: vi.fn(),
      summary: { total: 2, active: 1, error: null },
    });
  };
  act(() => root.render(createElement(Probe)));
  click("Toggle replace");
  expect(
    container
      .querySelector('[aria-label="Find in file"]')
      ?.getAttribute("data-container-class"),
  ).toContain("flex-1");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Replace with"]')
      ?.value,
  ).toBe("new");
  click("Match case");
  click("Match whole words");
  click("Use regular expression");
  expect(query).toMatchObject({
    caseSensitive: true,
    wholeWord: true,
    regexp: true,
    search: "old",
    replace: "new",
  });
  click("Replace all matches");
  expect(command).toHaveBeenCalledWith("replace-all");
  click("Toggle replace");
  expect(container.querySelector('[aria-label="Replace with"]')).toBeNull();
});
it("disables destructive search actions for invalid patterns or no matches", () => {
  const command = vi.fn();
  act(() =>
    root.render(
      createElement(EditorSearchBar, {
        query: { search: "[" },
        summary: { total: 0, active: 0, error: "Invalid regular expression" },
        replace: true,
        onReplaceChange: vi.fn(),
        onChange: vi.fn(),
        onCommand: command,
        onClose: vi.fn(),
      }),
    ),
  );
  click("Replace all matches");
  expect(command).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Invalid regular expression");
});
it("debounces problem search, combines severity filters, and selects the exact diagnostic", async () => {
  vi.useFakeTimers();
  const select = vi.fn();
  const diagnostics = [
    {
      from: 0,
      to: 1,
      code: 1,
      severity: "error" as const,
      message: "Invalid assignment",
      line: 1,
      column: 1,
    },
    {
      from: 2,
      to: 3,
      code: 2,
      severity: "warning" as const,
      message: "Unused name",
      line: 2,
      column: 1,
    },
  ];
  act(() =>
    root.render(
      createElement(EditorProblemsSheet, {
        open: true,
        onOpenChange: vi.fn(),
        analysis: { status: "ready", diagnostics },
        onSelect: select,
      }),
    ),
  );
  const input = container.querySelector("input")!;
  const warning = container.querySelector('[aria-label^="warning:"]')!;
  expect(warning.className).toContain("bg-warning/10");
  expect(
    warning.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const filters = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Warnings",
  )!;
  expect(
    filters.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  act(() => {
    input.value = "unused";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.textContent).toContain("Invalid assignment");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
  });
  expect(container.textContent).not.toContain("Invalid assignment");
  click("Errors");
  expect(container.textContent).toContain("No matching problems");
  click("Warnings");
  click("warning: Unused name, Line 2, column 1 · TS2");
  expect(select).toHaveBeenCalledWith(diagnostics[1]);
});

vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-glass": true }, children),
}));
vi.mock("react-native-reanimated", () => {
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
  };
  return {
    useAnimatedStyle: (callback: () => object) => callback(),
    withSpring: (value: number) => value,
    default: {
      View: ({ children }: { children: ReactNode }) =>
        createElement("div", null, children),
    },
    LinearTransition: transition,
    FadeIn: transition,
    FadeOut: transition,
    ReduceMotion: { System: "system" },
  };
});

it("keeps Problems at a compact glass detent when its search keyboard opens and closes", () => {
  const render = () =>
    act(() =>
      root.render(
        createElement(EditorProblemsSheet, {
          open: true,
          onOpenChange: vi.fn(),
          onSelect: vi.fn(),
        }),
      ),
    );
  const panel = () =>
    container.querySelector<HTMLElement>("[data-problems-layout]")!;
  render();
  const originalHeight = parseFloat(panel().style.height);
  keyboard.frame = { screenY: 460 };
  render();
  // Leave room above the sheet, rather than forcing iOS to a full-height opaque sheet.
  expect(parseFloat(panel().style.height)).toBeLessThan(460 * 0.8);
  expect(panel().getAttribute("data-keyboard-behavior")).toBeNull();
  expect(
    container.querySelector('[aria-label="Search problems"]'),
  ).not.toBeNull();
  keyboard.frame = { screenY: 410 }; // predictive text / symbol accessory changes
  render();
  expect(parseFloat(panel().style.height)).toBeLessThan(410 * 0.8);
  keyboard.frame = undefined;
  render();
  expect(parseFloat(panel().style.height)).toBe(originalHeight);
});

it("gives the Problems list its own viewport without a vertical ScrollView ancestor", () => {
  act(() =>
    root.render(
      createElement(EditorProblemsSheet, {
        open: true,
        onOpenChange: vi.fn(),
        onSelect: vi.fn(),
      }),
    ),
  );
  const list = container.querySelector("[data-list]")!;
  expect(list).not.toBeNull();
  expect(list.closest("[data-scroll]")).toBeNull();
});

it("gives Problems a heading, glass search and filters, and safe-area footer space", () => {
  act(() =>
    root.render(
      createElement(EditorProblemsSheet, {
        open: true,
        onOpenChange: vi.fn(),
        onSelect: vi.fn(),
      }),
    ),
  );
  expect(container.querySelector("h2")?.textContent).toBe(
    "Problems in this file",
  );
  expect(
    container
      .querySelector('[aria-label="Search problems"]')
      ?.closest("[data-glass]"),
  ).not.toBeNull();
  for (const label of ["All", "Errors", "Warnings", "Info"]) {
    const filter = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === label,
    )!;
    expect(filter.closest("[data-glass]")).not.toBeNull();
  }
  expect(
    parseFloat(
      container.querySelector<HTMLElement>("[data-problems-layout]")!.style
        .paddingBottom,
    ),
  ).toBeGreaterThanOrEqual(34 + 24);
});
