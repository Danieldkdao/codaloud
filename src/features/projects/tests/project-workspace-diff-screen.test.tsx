// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import WorkspaceDiffScreen from "@/app/projects/[projectId]/git/workspace-diff";
import type { ProjectRepositoryChangeSchema, ProjectRepositoryChangesSchema } from "../actions/change-schemas";

const query = vi.hoisted(() => ({
  read: vi.fn(), refetch: vi.fn(), isFetching: false, fetchStatus: "idle",
  error: null as Error | null,
  data: undefined as ProjectRepositoryChangesSchema | undefined,
}));
const route = vi.hoisted(() => ({ projectId: "11111111-1111-4111-8111-111111111111" }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => route }));
vi.mock("@/features/projects/hooks/use-project-changes", () => ({ useProjectChanges: (...args: unknown[]) => { query.read(...args); return query; } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 16, left: 0, right: 0 }) }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, accessibilityLabel, disabled }: { children: ReactNode; onPress?: () => void; accessibilityLabel?: string; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled }, children),
}));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children, accessibilityLabel, className, accessible }: { children?: ReactNode; accessibilityLabel?: string; className?: string; accessible?: boolean }) => createElement("span", { "aria-label": accessibilityLabel, className, "aria-hidden": accessible === false || undefined }, children);
  return { CodeText: Text, PText: Text, HeadingText: Text };
});
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }),
}));
vi.mock("react-native", () => ({
  Pressable: ({ children, accessibilityLabel, accessibilityState, onPress }: { children?: ReactNode; accessibilityLabel?: string; accessibilityState?: { expanded?: boolean }; onPress?: () => void }) =>
    createElement("button", { "aria-label": accessibilityLabel, "aria-expanded": accessibilityState?.expanded, onClick: onPress }, children),
  View: ({ children, accessibilityLabel, className }: { children?: ReactNode; accessibilityLabel?: string; className?: string }) => createElement("div", { "aria-label": accessibilityLabel, className }, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, keyExtractor, onRefresh, refreshing }: {
    data: unknown[]; renderItem: (info: { item: unknown; index: number }) => ReactNode;
    keyExtractor: (item: unknown, index: number) => string;
    ListHeaderComponent?: ReactNode; ListEmptyComponent?: ReactNode; onRefresh?: () => void; refreshing?: boolean;
  }) => createElement("div", { "data-refreshing": refreshing }, ListHeaderComponent,
    data.length ? data.map((item, index) => createElement("div", { key: keyExtractor(item, index) }, renderItem({ item, index }))) : ListEmptyComponent,
    onRefresh && createElement("button", { "aria-label": "Pull to refresh", onClick: onRefresh })),
}));

const change = (overrides: Partial<ProjectRepositoryChangeSchema> = {}): ProjectRepositoryChangeSchema => ({
  path: "src/live.ts", originalPath: null, indexStatus: "unchanged", worktreeStatus: "modified",
  isUntracked: false, isConflicted: false, kind: "file", headMode: "100644", indexMode: "100644", worktreeMode: "100644",
  staged: null, unstaged: { patch: "@@ -1 +1 @@\n-before\n+after\n", additions: 1, deletions: 1, unavailableReason: null },
  ...overrides,
});
const snapshot = (changes = [change()]): ProjectRepositoryChangesSchema => ({
  repositoryState: "ready", currentBranch: "actual-checkout", headSha: "a".repeat(40), isDetached: false,
  observedAt: "2026-09-13T12:00:00Z", changes,
});

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(createElement(WorkspaceDiffScreen)));
const click = (label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => button!.click());
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(query, { data: undefined, error: null, isFetching: false, fetchStatus: "idle" });
  route.projectId = "11111111-1111-4111-8111-111111111111";
  query.read.mockClear(); query.refetch.mockClear();
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it("loads the current project's changes instead of rendering fixture files", () => {
  query.isFetching = true;
  render();
  expect(query.read).toHaveBeenCalledWith(route.projectId);
  expect(container.textContent).toContain("Loading changes…");
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(container.textContent).not.toContain("project-commit-list.tsx");
  expect(container.textContent).not.toContain("No uncommitted changes");
});

it("renders backend files without branch or scope labels", () => {
  query.data = snapshot(); render();
  expect(container.textContent).toContain("live.ts");
  expect(container.textContent).not.toContain("actual-checkout");
  expect(container.textContent).toContain("1 file");
  expect(container.textContent).not.toContain("Unstaged");
  expect(container.textContent).not.toContain("@@");
  expect(container.querySelector('[aria-label="Added line 1: after"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Removed line 1: before"]')).not.toBeNull();
  expect(container.textContent).not.toContain("project-commit-list.tsx");
  click("Refresh workspace diff");
  expect(query.refetch).toHaveBeenCalledTimes(1);
});

it("keeps both comparisons of the same file and displays renames", () => {
  query.data = snapshot([change({ originalPath: "src/old.ts", indexStatus: "renamed",
    staged: { patch: "@@ -1 +1 @@\n-original\n+staged\n", additions: 1, deletions: 1, unavailableReason: null },
  })]); render();
  expect(container.textContent).toContain("From src/old.ts");
  expect(container.textContent).not.toContain("Staged");
  expect(container.textContent).not.toContain("Unstaged");
  expect(container.querySelector('[aria-label="Added line 1: staged"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Added line 1: after"]')).not.toBeNull();
  expect(container.textContent).toContain("1 file");
});

it("shows an initial failure with a working retry", () => {
  query.error = new Error("Request failed"); render();
  expect(container.textContent).toContain("Unable to load changes");
  expect(container.textContent).not.toContain("No uncommitted changes");
  click("Retry workspace diff");
  expect(query.refetch).toHaveBeenCalledTimes(1);
});

it("retains the previous diff with an explicit refresh error", () => {
  query.data = snapshot(); query.error = new Error("Request failed"); render();
  expect(container.textContent).toContain("Showing previously loaded changes");
  expect(container.textContent).toContain("after");
  click("Refresh workspace diff");
  expect(query.refetch).toHaveBeenCalledOnce();
});

it("retains data while updating and disables duplicate refreshes", () => {
  query.data = snapshot(); query.isFetching = true; render();
  expect(container.textContent).toContain("Updating changes…");
  expect(container.textContent).toContain("after");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Refresh workspace diff"]')?.disabled).toBe(true);
});

it.each([false, true])("shows a paused connection with cached data=%s", (cached) => {
  query.data = cached ? snapshot() : undefined; query.fetchStatus = "paused"; render();
  expect(container.textContent).toContain("Waiting for a connection…");
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  if (cached) expect(container.textContent).toContain("Showing previously loaded changes");
  expect(container.textContent).not.toContain("No uncommitted changes");
});

it.each([
  ["ready", "No uncommitted changes"],
  ["unborn", "No uncommitted changes"],
  ["not-initialized", "Git is not initialized"],
] as const)("distinguishes empty %s repositories", (repositoryState, title) => {
  query.data = { ...snapshot([]), repositoryState }; render();
  expect(container.textContent).toContain(title);
});

it.each([
  ["binary", "Binary file"],
  ["too-large", "too large"],
  ["unsupported", "unavailable"],
  ["conflict", "Merge conflict"],
] as const)("explains a %s preview while keeping the file visible", (unavailableReason, message) => {
  query.data = snapshot([change({ unstaged: { patch: null, additions: null, deletions: null, unavailableReason } })]); render();
  expect(container.textContent).toContain("live.ts");
  expect(container.textContent).toContain(message);
  expect(container.textContent).not.toContain("+0");
});

it("isolates malformed patches and displays metadata-only comparisons", () => {
  query.data = snapshot([
    change({ path: "malformed.ts", unstaged: { patch: "bad", additions: 1, deletions: 1, unavailableReason: null } }),
    change({ path: "executable.sh", worktreeMode: "100755", unstaged: { patch: "", additions: 0, deletions: 0, unavailableReason: null } }),
  ]); render();
  expect(container.textContent).toContain("Unable to display this patch");
  expect(container.textContent).toContain("executable.sh");
  expect(container.textContent).toContain("Executable file");
  expect(container.textContent).toContain("No text changes");
});

it("renders source text without displaying Git newline metadata", () => {
  query.data = snapshot([change({ unstaged: { patch: "@@ -1 +1 @@\n-before\n+after\n\\ No newline at end of file\n", additions: 1, deletions: 1, unavailableReason: null } })]); render();
  expect(container.textContent).not.toContain("No newline at end of file");
  expect(container.querySelector('[aria-label="Added line 1: after"]')).not.toBeNull();
});

it("does not retain a previous project's parsed files when the hook data changes", () => {
  query.data = snapshot(); render();
  route.projectId = "22222222-2222-4222-8222-222222222222";
  query.data = undefined; query.isFetching = true; render();
  expect(query.read).toHaveBeenLastCalledWith(route.projectId);
  expect(container.textContent).not.toContain("live.ts");
  expect(container.textContent).toContain("Loading changes…");
});


it("uses one line-number gutter and keeps indentation", () => {
  query.data = snapshot([change({ unstaged: {
    patch: "@@ -10,2 +10,2 @@\n unchanged\n-  before\n+  after\n", additions: 1, deletions: 1, unavailableReason: null,
  } })]); render();
  for (const [label, number] of [["Unchanged line 10: unchanged", "10"], ["Removed line 11:   before", "11"], ["Added line 11:   after", "11"]]) {
    const text = container.querySelector(`[aria-label="${label}"]`)!;
    const gutters = text.parentElement!.querySelectorAll('[aria-hidden="true"]');
    expect(gutters).toHaveLength(1);
    expect(gutters[0].textContent).toBe(number);
  }
});

it("paints row backgrounds once without a second tint behind the code", () => {
  query.data = snapshot(); render();
  for (const label of ["Added line 1: after", "Removed line 1: before"]) {
    const text = container.querySelector(`[aria-label="${label}"]`)!;
    expect(text.parentElement!.className).toMatch(/bg-/);
    expect(text.className).not.toMatch(/bg-/);
  }
});


it("separates change markers from code without altering source indentation", () => {
  query.data = snapshot([change({ unstaged: {
    patch: "@@ -1 +1 @@\n-  before\n+  after\n", additions: 1, deletions: 1, unavailableReason: null,
  } })]); render();
  expect(container.querySelector('[aria-label="Added line 1:   after"]')?.textContent).toBe("+   after");
  expect(container.querySelector('[aria-label="Removed line 1:   before"]')?.textContent).toBe("−   before");
});


it("opens all files by default and toggles each file independently", () => {
  query.data = snapshot([change(), change({ path: "src/other.ts" })]); render();
  expect(container.querySelector('[aria-label="Collapse src/live.ts diff"]')?.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelectorAll('[aria-label="Added line 1: after"]')).toHaveLength(2);
  click("Collapse src/live.ts diff");
  const collapsed = container.querySelector('[aria-label="Expand src/live.ts diff"]');
  expect(collapsed?.getAttribute("aria-expanded")).toBe("false");
  expect(collapsed?.querySelector('[data-icon="chevron-down"]')).not.toBeNull();
  expect(container.querySelectorAll('[aria-label="Added line 1: after"]')).toHaveLength(1);
  click("Expand src/live.ts diff");
  expect(container.querySelector('[aria-label="Collapse src/live.ts diff"] [data-icon="chevron-up"]')).not.toBeNull();
  expect(container.querySelectorAll('[aria-label="Added line 1: after"]')).toHaveLength(2);
});

it("preserves collapsed files during refresh and opens new files by default", () => {
  query.data = snapshot(); render();
  click("Collapse src/live.ts diff");
  query.data = snapshot([change(), change({ path: "new.ts" })]); render();
  expect(container.querySelector('[aria-label="Expand src/live.ts diff"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Collapse new.ts diff"]')).not.toBeNull();
  expect(container.querySelectorAll('[aria-label="Added line 1: after"]')).toHaveLength(1);
});

it("starts expanded when switching to another project with the same filename", () => {
  query.data = snapshot(); render();
  click("Collapse src/live.ts diff");
  route.projectId = "22222222-2222-4222-8222-222222222222";
  query.data = snapshot(); render();
  expect(container.querySelector('[aria-label="Collapse src/live.ts diff"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Added line 1: after"]')).not.toBeNull();
});
