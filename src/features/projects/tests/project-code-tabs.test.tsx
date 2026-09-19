// @vitest-environment happy-dom
import { act, createElement, type ReactNode, useImperativeHandle, type Ref, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectCodeTabs } from "../components/project-code-tabs";
import { ProjectCodeStatus } from "../components/project-code-status";
import { ProjectCodeTools } from "../components/project-code-tools";
import { formatProjectEditorTab } from "../lib/formatters";

const layoutEvents = new Map<string, (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void>();
const scrollTo = vi.fn();
const scrollToIndex = vi.fn();
const pathQuery = vi.hoisted(() => ({ data: ["a.ts", "lib/b.ts", "src/Closed.ts"], isPending: false, isFetching: false, error: null as Error | null, refetch: vi.fn() }));
vi.mock("../hooks/use-project-file-paths", () => ({ useProjectFilePaths: () => pathQuery }));
vi.mock("@/components/ui/input", () => ({ Input: ({ value, onChangeText, accessibilityLabel }: { value: string; onChangeText: (value: string) => void; accessibilityLabel: string }) => createElement("input", { value, "aria-label": accessibilityLabel, onInput: (event) => onChangeText(event.currentTarget.value) }) }));

vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));

vi.mock("react-native-reanimated", () => {
  const transition = { duration: () => transition, reduceMotion: () => transition, springify: () => transition, dampingRatio: () => transition };
  return {
    default: { View: ({ children, style, testID, pointerEvents, layout }: { children?: ReactNode; style?: object; testID?: string; pointerEvents?: string; layout?: unknown }) => createElement("div", { style: Object.assign({}, ...[style].flat()), "data-testid": testID, "data-pointer-events": pointerEvents, "data-layout-animation": Boolean(layout) }, children) },
    useAnimatedStyle: (callback: () => object) => callback(),
    withTiming: (value: number) => value,
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
  };
});
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  View: ({ children, testID, onLayout, className }: { children: ReactNode; testID?: string; onLayout?: (event: never) => void; className?: string }) => {
    if (testID && onLayout) layoutEvents.set(testID, onLayout as never);
    return createElement("div", { "data-testid": testID, "data-class": className }, children);
  },
  FlatList: ({ data, renderItem, CellRendererComponent, ListHeaderComponent, ref, testID, onLayout }: {
    data: string[]; renderItem: (info: { item: string }) => ReactNode;
    CellRendererComponent: ComponentType<{ item: string; children?: ReactNode }>;
    ListHeaderComponent?: ReactNode; ref?: Ref<unknown>; testID?: string; onLayout?: (event: never) => void;
  }) => {
    useImperativeHandle(ref, () => ({ scrollToOffset: scrollTo, scrollToIndex }));
    if (testID && onLayout) layoutEvents.set(testID, onLayout as never);
    return createElement("div", { "data-testid": testID }, ListHeaderComponent,
      data.map((item) => CellRendererComponent ? createElement(CellRendererComponent, { item, key: item }, renderItem({ item })) : createElement("div", { key: item }, renderItem({ item }))));
  },
  ScrollView: ({ children, ref, testID, onLayout }: { children: ReactNode; ref?: Ref<unknown>; testID?: string; onLayout?: (event: never) => void }) => {
    useImperativeHandle(ref, () => ({ scrollTo }));
    if (testID && onLayout) layoutEvents.set(testID, onLayout as never);
    return createElement("div", { "data-testid": testID }, children);
  },
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState, disabled, className }: { children: ReactNode; onPress: () => void; accessibilityLabel: string; accessibilityState?: { selected?: boolean }; disabled?: boolean; className?: string }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-selected": accessibilityState?.selected, "data-class": className, disabled }, children),
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
}));
vi.mock("@/components/ui/glass-surface", () => ({ GlassSurface: ({ children }: { children: ReactNode }) => createElement("div", { "data-glass": true }, children) }));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }) }));
vi.mock("@/components/ui/content-sheet", () => ({ ContentSheet: ({ open, children, onOpenChange }: { open: boolean; children: ReactNode; onOpenChange: (open: boolean) => void }) => open ? createElement("div", { role: "dialog" }, children, createElement("button", { "aria-label": "Dismiss sheet", onClick: () => onOpenChange(false) })) : null }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => createElement("span", null, children), CodeText: ({ children }: { children: ReactNode }) => createElement("span", null, children), HeadingText: ({ children }: { children: ReactNode }) => createElement("h2", null, children) }));
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
  act(() => root.render(createElement(ProjectCodeTabs, { projectId: "project-one", paths: ["a.ts", "lib/b.ts"], activePath: "a.ts", onSelect, onClose, onOpenFile })));
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
  act(() => root.render(createElement(ProjectCodeTabs, { projectId: "project-one", paths: [], activePath: null, onSelect: vi.fn(), onClose: vi.fn(), onOpenFile })));
  click("Open another file"); expect(onOpenFile).toHaveBeenCalledOnce();
});

it("keeps the plus and file count outside the scrolling tab strip", () => {
  act(() => root.render(createElement(ProjectCodeTabs, {
    projectId: "project-one",    paths: ["a.ts", "b.ts"], activePath: "a.ts", onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn(),
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

it("keeps glass inside the selected cell before measurement and after switching, removal, and resizing", () => {
  const renderTabs = (activePath: string | null, paths = ["a.ts", "b.ts"]) => act(() => root.render(createElement(ProjectCodeTabs, {
    projectId: "project-one",    paths, activePath, onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn(),
  })));
  const expectGlass = (path: string) => {
    const indicators = container.querySelectorAll('[data-testid="code-tab-indicator"]');
    expect(indicators).toHaveLength(1);
    expect(container.querySelector(`[data-testid="code-tab-${path}"]`)?.contains(indicators[0])).toBe(true);
    expect(indicators[0].querySelector(`[aria-label="${path}"]`)).not.toBeNull();
    expect(indicators[0].querySelector('[data-glass]')).not.toBeNull();
  };
  renderTabs("a.ts");
  expectGlass("a.ts");
  measure("code-tab-a.ts", 8, 150);
  measure("code-tab-b.ts", 162, 210);
  renderTabs("b.ts");
  expectGlass("b.ts");
  renderTabs("b.ts", ["b.ts"]);
  expectGlass("b.ts");
  measure("code-tab-b.ts", 8, 240, 56);
  expectGlass("b.ts");
  renderTabs("b.ts", ["a.ts", "b.ts"]);
  measure("code-tab-b.ts", 320, 240, 56);
  expectGlass("b.ts");
  renderTabs(null, []);
  expect(container.querySelector('[data-testid="code-tab-indicator"]')).toBeNull();
});

it("only scrolls the strip when the active tab is outside its visible area", () => {
  const renderTabs = (activePath: string) => act(() => root.render(createElement(ProjectCodeTabs, {
    projectId: "project-one",    paths: ["a.ts", "b.ts"], activePath, onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn(),
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


it("uses glass for the fixed file-count control", () => {
  act(() => root.render(createElement(ProjectCodeTabs, {
    projectId: "project-one",    paths: ["a.ts"], activePath: "a.ts", onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn(),
  })));
  const count = container.querySelector('[aria-label="1 file open. Show all files."]')!;
  expect(count).not.toBeNull();
  expect(count.closest('[data-glass]')).not.toBeNull();
});

it("gives the count and add-file controls matching 48-point glass surfaces", () => {
  act(() => root.render(createElement(ProjectCodeTabs, {
    projectId: "project-one",    paths: ["a.ts"], activePath: "a.ts", onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn(),
  })));
  for (const label of ["Open another file", "1 file open. Show all files."]) {
    const control = container.querySelector(`[aria-label="${label}"]`)!;
    expect(control.getAttribute("data-class")?.split(" ")).toContain("size-12");
    expect(control.closest('[data-glass]')).not.toBeNull();
  }
});

const searchPaths = (value: string) => act(() => {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Search project paths"]')!;
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

it("instantly searches full local paths case-insensitively and opens files outside the tabs", () => {
  const onSelect = vi.fn();
  act(() => root.render(createElement(ProjectCodeTabs, { projectId: "project-one", paths: ["a.ts", "lib/b.ts"], activePath: "a.ts", onSelect, onClose: vi.fn(), onOpenFile: vi.fn() })));
  click("2 files open. Show all files.");
  expect(container.querySelector('[aria-label="Open src/Closed.ts"]')).toBeNull();
  searchPaths("  SRC/CLO  ");
  expect(container.querySelector('[role="dialog"] [aria-label="Switch to a.ts"]')).toBeNull();
  expect(container.querySelector('[role="dialog"] [aria-label="Close src/Closed.ts"]')).toBeNull();
  click("Open src/Closed.ts");
  expect(onSelect).toHaveBeenCalledWith("src/Closed.ts");
  click("2 files open. Show all files.");
  expect(container.querySelector('[aria-label="Switch to a.ts"]')).not.toBeNull();
});

it("shows an empty search result and clears back to open files without hiding Open another file", () => {
  act(() => root.render(createElement(ProjectCodeTabs, { projectId: "project-one", paths: ["a.ts"], activePath: "a.ts", onSelect: vi.fn(), onClose: vi.fn(), onOpenFile: vi.fn() })));
  click("1 file open. Show all files.");
  searchPaths("missing");
  expect(container.textContent).toContain("No matching paths");
  expect(container.querySelector('[role="dialog"] [aria-label="Open another file"]')).not.toBeNull();
  click("Clear file search");
  expect(container.querySelector('[aria-label="Switch to a.ts"]')).not.toBeNull();
});

it("opens and dismisses the tool groups without a header or enabling unfinished operations", () => {
  act(() => root.render(createElement(ProjectCodeTools)));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Editor tools");
  const sheet = container.querySelector('[role="dialog"]')!;
  expect(sheet.textContent).not.toContain("Editor tools");
  expect(sheet.textContent).not.toContain("Preview");
  expect(sheet.textContent).not.toContain("src/hello.ts");
  expect(sheet.textContent).not.toContain("These tools and settings are coming soon.");
  for (const label of ["Find in file", "Replace in file", "Go to line", "Format code", "Organize imports", "Toggle comment", "Font and size", "Word wrap", "Line numbers"]) {
    expect(sheet.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.disabled).toBe(true);
  }
  click("Dismiss sheet");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});
