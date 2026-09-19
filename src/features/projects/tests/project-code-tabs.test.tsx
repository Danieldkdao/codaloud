// @vitest-environment happy-dom
import { act, createElement, type ReactNode, useImperativeHandle, type Ref, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectCodeTabs } from "../components/project-code-tabs";
import { ProjectCodeStatus } from "../components/project-code-status";
import { formatProjectEditorTab } from "../lib/formatters";

const layoutEvents = new Map<string, (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void>();
const scrollTo = vi.fn();
const scrollToIndex = vi.fn();

vi.mock("react-native-reanimated", () => {
  const transition = { duration: () => transition, reduceMotion: () => transition, springify: () => transition, dampingRatio: () => transition };
  return {
    default: { View: ({ children, style, testID, pointerEvents, layout }: { children?: ReactNode; style?: object; testID?: string; pointerEvents?: string; layout?: unknown }) => createElement("div", { style, "data-testid": testID, "data-pointer-events": pointerEvents, "data-layout-animation": Boolean(layout) }, children) },
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
  };
});
vi.mock("react-native", () => ({
  View: ({ children, testID, onLayout }: { children: ReactNode; testID?: string; onLayout?: (event: never) => void }) => {
    if (testID && onLayout) layoutEvents.set(testID, onLayout as never);
    return createElement("div", { "data-testid": testID }, children);
  },
  FlatList: ({ data, renderItem, CellRendererComponent, ListHeaderComponent, ref, testID, onLayout }: {
    data: string[]; renderItem: (info: { item: string }) => ReactNode;
    CellRendererComponent: ComponentType<{ item: string; children?: ReactNode }>;
    ListHeaderComponent?: ReactNode; ref?: Ref<unknown>; testID?: string; onLayout?: (event: never) => void;
  }) => {
    useImperativeHandle(ref, () => ({ scrollToOffset: scrollTo, scrollToIndex }));
    if (testID && onLayout) layoutEvents.set(testID, onLayout as never);
    return createElement("div", { "data-testid": testID }, ListHeaderComponent,
      data.map((item) => createElement(CellRendererComponent, { item, key: item }, renderItem({ item }))));
  },
  ScrollView: ({ children, ref, testID, onLayout }: { children: ReactNode; ref?: Ref<unknown>; testID?: string; onLayout?: (event: never) => void }) => {
    useImperativeHandle(ref, () => ({ scrollTo }));
    if (testID && onLayout) layoutEvents.set(testID, onLayout as never);
    return createElement("div", { "data-testid": testID }, children);
  },
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState, disabled }: { children: ReactNode; onPress: () => void; accessibilityLabel: string; accessibilityState?: { selected?: boolean }; disabled?: boolean }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-selected": accessibilityState?.selected, disabled }, children),
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
}));
vi.mock("@/components/ui/glass-surface", () => ({ GlassSurface: ({ children }: { children: ReactNode }) => createElement("div", { "data-glass": true }, children) }));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }) }));
vi.mock("@/components/ui/content-sheet", () => ({ ContentSheet: ({ open, children }: { open: boolean; children: ReactNode }) => open ? createElement("div", { role: "dialog" }, children) : null }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => createElement("span", null, children), HeadingText: ({ children }: { children: ReactNode }) => createElement("h2", null, children) }));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "theme-color" }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => { layoutEvents.clear(); scrollTo.mockClear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); });
afterEach(() => act(() => root.unmount()));
const click = (label: string) => act(() => {
  const button = [...container.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label);
  expect(button).toBeDefined(); button!.click();
});

it("formats the extension alongside the name and disambiguates identical filenames by folder", () => {
  expect(formatProjectEditorTab("src/button.tsx", ["src/button.tsx", "src/button.ts"])).toMatchObject({ name: "button", extension: ".tsx", directory: null });
  expect(formatProjectEditorTab("src/app/index.tsx", ["src/app/index.tsx", "src/settings/index.tsx"])).toMatchObject({ name: "index", extension: ".tsx", directory: "app" });
  expect(formatProjectEditorTab(".gitignore", [".gitignore"])).toMatchObject({ name: ".gitignore", extension: "" });
});

it("switches and closes tabs, opens Files, and selects a file from the count sheet", () => {
  const onSelect = vi.fn(); const onClose = vi.fn(); const onOpenFile = vi.fn();
  act(() => root.render(createElement(ProjectCodeTabs, { paths: ["a.ts", "lib/b.ts"], activePath: "a.ts", onSelect, onClose, onOpenFile })));
  click("lib/b.ts"); expect(onSelect).toHaveBeenCalledWith("lib/b.ts");
  click("Close a.ts"); expect(onClose).toHaveBeenCalledWith("a.ts");
  click("Open another file"); expect(onOpenFile).toHaveBeenCalledOnce();
  click("2 files open. Show all files.");
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  click("Switch to lib/b.ts"); expect(onSelect).toHaveBeenLastCalledWith("lib/b.ts");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps new-file navigation available when the last tab is closed", () => {
  const onOpenFile = vi.fn();
  act(() => root.render(createElement(ProjectCodeTabs, { paths: [], activePath: null, onSelect: vi.fn(), onClose: vi.fn(), onOpenFile })));
  click("Open another file"); expect(onOpenFile).toHaveBeenCalledOnce();
});

it("keeps the plus and file count outside the scrolling tab strip", () => {
  act(() => root.render(createElement(ProjectCodeTabs, {
    paths: ["a.ts", "b.ts"], activePath: "a.ts", onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn(),
  })));
  const strip = container.querySelector('[data-testid="code-tab-scroll"]')!;
  expect(strip).not.toBeNull();
  expect(strip.querySelector('[aria-label="a.ts"]')).not.toBeNull();
  expect(strip.querySelector('[aria-label="Open another file"]')).toBeNull();
  expect(strip.querySelector('[aria-label="2 files open. Show all files."]')).toBeNull();
});

it("lays out analysis and save indicators without position or size transitions", () => {
  act(() => root.render(createElement(ProjectCodeStatus, {
    status: { status: "saved" }, onRetry: vi.fn(), onShowProblems: vi.fn(),
    analysis: { status: "checking", diagnostics: [] },
  })));
  expect(container.querySelector('[data-layout-animation="true"]')).toBeNull();
});

it("shows real diagnostic counts and exposes Problems and save retry independently", () => {
  const onShowProblems = vi.fn(); const onRetry = vi.fn();
  act(() => root.render(createElement(ProjectCodeStatus, {
    status: { status: "error", message: "Save failed" }, onRetry, onShowProblems,
    analysis: { status: "ready", diagnostics: [{ from: 0, to: 1, message: "Bad type", severity: "error", code: 1 }] },
  })));
  expect(container.querySelector('[data-icon="x-circle"]')).not.toBeNull();
  click("Couldn't save file. Tap to retry."); expect(onRetry).toHaveBeenCalledOnce();
  act(() => [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label")?.includes("error") && !button.getAttribute("aria-label")?.includes("save"))!.click());
  expect(onShowProblems).toHaveBeenCalledOnce();
});


const measure = (id: string, x: number, width: number, height = 48) => act(() => {
  expect(layoutEvents.has(id)).toBe(true);
  layoutEvents.get(id)!({ nativeEvent: { layout: { x, y: 8, width, height } } });
});

it("slides one glass selection between measured tabs and follows tab removal and resizing", () => {
  const renderTabs = (activePath: string | null, paths = ["a.ts", "b.ts"]) => act(() => root.render(createElement(ProjectCodeTabs, {
    paths, activePath, onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn(),
  })));
  renderTabs("a.ts");
  measure("code-tab-a.ts", 8, 150);
  measure("code-tab-b.ts", 162, 210);
  const pill = container.querySelector<HTMLElement>('[data-testid="code-tab-indicator"]')!;
  expect(pill).not.toBeNull();
  expect(pill.querySelector('[data-glass]')).not.toBeNull();
  expect(pill.getAttribute("data-pointer-events")).toBe("none");
  expect(pill.style.left).toBe("8px");
  expect(pill.style.width).toBe("150px");
  renderTabs("b.ts");
  expect(container.querySelector('[data-testid="code-tab-indicator"]')).toBe(pill);
  expect(pill.style.left).toBe("162px");
  expect(pill.style.width).toBe("210px");
  renderTabs("b.ts", ["b.ts"]);
  measure("code-tab-b.ts", 8, 240, 56);
  expect(pill.style.left).toBe("8px");
  expect(pill.style.width).toBe("240px");
  expect(pill.style.height).toBe("56px");
  renderTabs(null, []);
  expect(container.querySelector('[data-testid="code-tab-indicator"]')).toBeNull();
});

it("only scrolls the strip when the active tab is outside its visible area", () => {
  const renderTabs = (activePath: string) => act(() => root.render(createElement(ProjectCodeTabs, {
    paths: ["a.ts", "b.ts"], activePath, onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn(),
  })));
  scrollTo.mockClear();
  renderTabs("a.ts");
  measure("code-tab-scroll", 0, 300);
  measure("code-tab-a.ts", 8, 120);
  measure("code-tab-b.ts", 132, 120);
  renderTabs("b.ts");
  expect(scrollTo).not.toHaveBeenCalled();
  measure("code-tab-b.ts", 320, 160);
  expect(scrollTo).toHaveBeenLastCalledWith({ offset: 192, animated: true });
});
