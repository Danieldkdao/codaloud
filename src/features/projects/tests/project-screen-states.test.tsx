// @vitest-environment happy-dom
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AgentScreen from "@/app/projects/[projectId]/agent";
import CodeScreen from "@/app/projects/[projectId]/code";
import GitScreen from "@/app/projects/[projectId]/git";

const state = vi.hoisted(() => ({ empty: false, focus: 0, ready: undefined as (() => Promise<void>) | undefined }));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ isDarkMode: true }) }));
vi.mock("expo-router", () => ({ useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect, state.focus]) }));
vi.mock("@/hooks/use-editor-development-shortcuts", () => ({ useEditorDevelopmentShortcuts: () => {} }));
vi.mock("@/components/code-editor", () => ({ default: ({ onReady, colorScheme }: { onReady: () => Promise<void>; colorScheme: string }) => {
  state.ready = onReady;
  return createElement("textarea", { defaultValue: "Editable code", "data-theme": colorScheme });
} }));
vi.mock("@/components/code-editor-loading", () => ({ CodeEditorLoading: () => createElement("span", null, "Initializing your editor") }));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) => createElement("span", null, children);
  return { PText: Text, HeadingText: Text, CodeText: Text };
});
vi.mock("@/components/app-wrapper", () => ({ AppWrapper: ({ children }: { children?: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: 0, right: 0 }) }));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Pressable: ({ children }: { children?: ReactNode }) => createElement("button", null, children),
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: {
    data: unknown[]; renderItem: (info: { item: unknown; index: number }) => ReactNode;
    ListHeaderComponent?: ReactNode; ListEmptyComponent?: ReactNode;
  }) => createElement("div", null, ListHeaderComponent, data.length ? data.map((item, index) =>
    createElement("div", { key: index }, renderItem({ item, index }))) : ListEmptyComponent),
}));
vi.mock("@/features/projects/components/project-branch-select", () => ({ ProjectBranchSelect: () => null }));
vi.mock("@/features/projects/components/project-workspace-search", () => ({ ProjectWorkspaceSearch: () => null }));
vi.mock("@/features/projects/data/demo-code", () => ({
  get demoCodeFilename() { return state.empty ? "" : "workspace.ts"; }, demoCode: "",
}));
vi.mock("@/features/projects/data/demo-commits", () => ({
  get demoBranches() { return state.empty ? [] : [{ name: "main", commits: [] }]; },
}));
vi.mock("@/features/projects/data/demo-agent-activity", () => ({ demoAgentActivity: [] }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.empty = false;
  state.focus = 0;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

it.each([
  { name: "Git", Screen: GitScreen, loading: "Loading commits", empty: "No commits yet" },
  { name: "Agent", Screen: AgentScreen, loading: "Loading activity", empty: "No activity yet" },
])("previews loading for two seconds before showing empty content: $name", ({ Screen, loading, empty }) => {
  act(() => root.render(createElement(Screen)));
  expect(container.textContent).toContain(loading);
  expect(container.textContent).not.toContain(empty);
  act(() => vi.advanceTimersByTime(1999));
  expect(container.textContent).toContain(loading);
  act(() => vi.advanceTimersByTime(1));
  expect(container.textContent).not.toContain(loading);
  expect(container.textContent).toContain(empty);
});

it("keeps the editor mounted and waits for both the preview and actual readiness", async () => {
  act(() => root.render(createElement(CodeScreen)));
  const editor = container.querySelector("textarea");
  expect(editor).not.toBeNull();
  expect(editor?.dataset.theme).toBe("dark");
  act(() => vi.advanceTimersByTime(2000));
  expect(container.textContent).toContain("Initializing your editor");
  await act(async () => { await state.ready!(); });
  expect(container.textContent).not.toContain("Initializing your editor");
  expect(container.querySelector("textarea")).toBe(editor);
  state.focus++;
  act(() => root.render(createElement(CodeScreen)));
  expect(container.textContent).toContain("Initializing your editor");
  act(() => vi.advanceTimersByTime(2000));
  expect(container.textContent).not.toContain("Initializing your editor");
  expect(container.querySelector("textarea")).toBe(editor);
});

it("shows the full two-second Code preview even when the editor is already ready", async () => {
  act(() => root.render(createElement(CodeScreen)));
  await act(async () => { await state.ready!(); });
  act(() => vi.advanceTimersByTime(1999));
  expect(container.textContent).toContain("Initializing your editor");
  act(() => vi.advanceTimersByTime(1));
  expect(container.textContent).not.toContain("Initializing your editor");
  expect(container.querySelector("textarea")).not.toBeNull();
});

it.each([
  { name: "Code", Screen: CodeScreen, empty: "No file selected" },
  { name: "Git", Screen: GitScreen, empty: "No commits yet" },
])("handles missing screen data after loading: $name", ({ Screen, empty }) => {
  state.empty = true;
  act(() => root.render(createElement(Screen)));
  expect(container.textContent).not.toContain(empty);
  act(() => vi.advanceTimersByTime(2000));
  expect(container.textContent).toContain(empty);
  expect(container.querySelector("textarea")).toBeNull();
});

it("clears the pending preview when the screen unmounts", () => {
  act(() => root.render(createElement(AgentScreen)));
  expect(vi.getTimerCount()).toBe(1);
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});
