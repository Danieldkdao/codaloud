// @vitest-environment happy-dom
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AgentScreen from "@/app/projects/[projectId]/agent";
import CodeScreen from "@/app/projects/[projectId]/code";
import { ProjectWorkspaceCurrentFileContext } from "@/features/projects/contexts/project-workspace-context";
import GitScreen from "@/app/projects/[projectId]/git";

const fileQuery = vi.hoisted(() => ({ data: undefined as { path: string; content: string; size: number } | undefined, isPending: true, isError: false, isFetching: true, error: null as Error | null, refetch: vi.fn() }));
const readFile = vi.hoisted(() => vi.fn());
vi.mock("@/features/projects/hooks/use-project-file", () => ({ useProjectFile: (...args: unknown[]) => { readFile(...args); return fileQuery; } }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => createElement("button", { onClick: onPress }, children) }));
const state = vi.hoisted(() => ({ empty: false, focus: 0, ready: undefined as (() => Promise<void>) | undefined }));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ isDarkMode: true }) }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ projectId: "project-one" }), useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect, state.focus]) }));
vi.mock("@/hooks/use-editor-development-shortcuts", () => ({ useEditorDevelopmentShortcuts: () => {} }));
vi.mock("@/components/code-editor", () => ({ default: ({ onReady, colorScheme, initialValue }: { onReady: () => Promise<void>; colorScheme: string; initialValue: string }) => {
  state.ready = onReady;
  return createElement("textarea", { key: initialValue, defaultValue: initialValue, "data-theme": colorScheme });
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
vi.mock("@/features/projects/data/demo-commits", () => ({
  get demoBranches() { return state.empty ? [] : [{ name: "main", commits: [] }]; },
}));
vi.mock("@/features/projects/data/demo-agent-activity", () => ({ demoAgentActivity: [] }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(fileQuery, { data: undefined, isPending: true, isError: false, isFetching: true, error: null });
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

const renderCode = (path: string | null = "app/page.tsx") => act(() => root.render(
  createElement(ProjectWorkspaceCurrentFileContext, { value: { filePath: path, setFilePath: vi.fn() } }, createElement(CodeScreen)),
));
const finishLoading = (content = "const value = 1;", path = "app/page.tsx") => {
  Object.assign(fileQuery, { data: { path, content, size: content.length }, isPending: false, isFetching: false, isError: false });
};

it("shows the same loading UI for fetching and editor startup, without a preview timer", async () => {
  renderCode();
  expect(readFile).toHaveBeenLastCalledWith("project-one", "app/page.tsx");
  expect(container.textContent).toContain("Initializing your editor");
  expect(container.querySelector("textarea")).toBeNull();
  finishLoading();
  renderCode();
  expect(container.querySelector("textarea")?.value).toBe("const value = 1;");
  expect(container.querySelector("textarea")?.dataset.theme).toBe("dark");
  expect(container.textContent).toContain("Initializing your editor");
  await act(async () => { await state.ready!(); });
  expect(container.textContent).not.toContain("Initializing your editor");
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves edits when the same file refreshes or the tab is revisited", async () => {
  finishLoading();
  renderCode();
  await act(async () => { await state.ready!(); });
  const editor = container.querySelector("textarea")!;
  editor.value = "unsaved edit";
  finishLoading("updated remotely");
  state.focus++;
  renderCode();
  expect(container.querySelector("textarea")).toBe(editor);
  expect(editor.value).toBe("unsaved edit");
  expect(container.textContent).not.toContain("Initializing your editor");
  Object.assign(fileQuery, { isError: true, error: new Error("Offline") });
  renderCode();
  expect(container.querySelector("textarea")).toBe(editor);
});

it("resets content and readiness on file changes, including cached empty files", async () => {
  finishLoading();
  renderCode();
  const oldReady = state.ready!;
  await act(async () => { await oldReady(); });
  const oldEditor = container.querySelector("textarea");
  finishLoading("", "empty.ts");
  renderCode("empty.ts");
  expect(container.querySelector("textarea")).not.toBe(oldEditor);
  expect(container.querySelector("textarea")?.value).toBe("");
  await act(async () => { await oldReady(); });
  expect(container.textContent).toContain("Initializing your editor");
  await act(async () => { await state.ready!(); });
  expect(container.textContent).not.toContain("Initializing your editor");
});

it("shows a selection prompt immediately when there is no current file", () => {
  renderCode(null);
  expect(readFile).toHaveBeenLastCalledWith("project-one", null);
  expect(container.textContent).toContain("No file selected");
  expect(container.textContent).not.toContain("Initializing your editor");
  expect(container.querySelector("textarea")).toBeNull();
});

it("shows file errors with a retry and resumes loading while retrying", () => {
  Object.assign(fileQuery, { isPending: false, isFetching: false, isError: true, error: new Error("This file is too large to open.") });
  renderCode();
  expect(container.textContent).toContain("This file is too large to open.");
  expect(container.querySelector("textarea")).toBeNull();
  act(() => container.querySelector("button")!.click());
  expect(fileQuery.refetch).toHaveBeenCalledTimes(1);
  Object.assign(fileQuery, { isPending: true, isFetching: true, isError: false });
  renderCode();
  expect(container.textContent).toContain("Initializing your editor");
});

it.each([
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
