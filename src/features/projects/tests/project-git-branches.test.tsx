// @vitest-environment happy-dom
import { ProjectWorkspaceDockHeightProvider } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { ProjectWorkspaceFileCreationProvider } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { act, createElement, useImperativeHandle, useState, useRef, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectChangesPanel } from "@/features/projects/components/project-changes-panel";
import GitScreen from "@/app/projects/[projectId]/git";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";
import { ProjectWorkspaceBranchProvider } from "@/features/projects/hooks/use-project-workspace-branch";

const live = vi.hoisted(() => ({
  projectId: "11111111-1111-4111-8111-111111111111",
  userId: "user-one",
  repositoryId: "123" as string | null,
  query: vi.fn(),
  loadMore: vi.fn(), retry: vi.fn(),
  isPending: false, isFetching: false, isFetchingNextPage: false, isFetchNextPageError: false,
  hasNextPage: false, fetchStatus: "idle", error: null as Error | null,
  data: { pages: [{ branches: ["main", "feature/live", "fix/live"], currentBranch: "main" as string | null, nextCursor: null as string | null }] } as { pages: { branches: string[]; currentBranch: string | null; nextCursor: string | null }[] } | undefined,
}));
const remote = vi.hoisted(() => ({
  query: vi.fn(), loadMore: vi.fn(), retry: vi.fn(),
  isPending: false, isFetching: false, isFetchingNextPage: false, isFetchNextPageError: false,
  hasNextPage: false, fetchStatus: "idle", error: null as Error | null,
  data: { pages: [{ branches: [{ name: "main" }, { name: "remote-only" }], nextCursor: null }] },
}));
vi.mock("@/features/projects/hooks/use-project", () => ({ useProject: () => ({ data: { githubRepositoryId: live.repositoryId }, isPending: false, error: null }) }));
vi.mock("@/services/github/hooks/use-github-repository-branches", () => ({ useGitHubRepositoryBranches: (...args: unknown[]) => { remote.query(...args); return remote; } }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => ({ data: { user: { id: live.userId } }, isPending: false, error: null }) }));
vi.mock("@/features/projects/hooks/use-project-branches", () => ({ useProjectBranches: (...args: unknown[]) => { live.query(...args); return { ...live, data: live.data }; } }));
let activeTab = "git";
const switchTab = vi.fn((name: string) => { activeTab = name; });
vi.mock("expo-router", () => ({ usePathname: () => `/projects/${live.projectId}/${activeTab}`, useLocalSearchParams: () => ({ projectId: live.projectId }) }));
vi.mock("expo-router/ui", () => ({
  TabTrigger: ({ children }: { children: ReactNode }) => children,
  useTabTrigger: () => ({ switchTab }),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
    createElement("div", { style: Object.assign({}, ...([style].flat().filter(Boolean) as object[])) }, children) },
  ReduceMotion: { System: "system" },
  useSharedValue: (value: number) => useRef({ value }).current,
  useAnimatedStyle: (callback: () => object) => callback(),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, disabled, accessibilityLabel }: { children: ReactNode; onPress?: () => void; disabled?: boolean; accessibilityLabel?: string }) =>
    createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel }, children),
}));
vi.mock("@expo/vector-icons", () => ({ Feather: {}, Ionicons: {} }));
const Workspace = () => (
  <ProjectWorkspaceDockHeightProvider>
    <ProjectWorkspaceBranchProvider>
      <GitScreen />
      <ProjectWorkspaceFileCreationProvider projectId="demo">
        <ProjectWorkspaceDock />
      </ProjectWorkspaceFileCreationProvider>
    </ProjectWorkspaceBranchProvider>
  </ProjectWorkspaceDockHeightProvider>
);

vi.mock("@/features/projects/hooks/use-workspace-loading-preview", () => ({ useWorkspaceLoadingPreview: () => false }));
vi.mock("@/features/projects/components/project-workspace-search", () => ({ ProjectWorkspaceSearch: ({ accessibilityLabel, onOpenChange }: { accessibilityLabel: string; onOpenChange?: (open: boolean) => void }) => {
  const [open, setOpen] = useState(false);
  return createElement("button", {
    "aria-label": open ? "Dismiss search" : accessibilityLabel,
    onClick: () => { setOpen(!open); onOpenChange?.(!open); },
  });
} }));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@expo/ui/community/bottom-sheet", () => ({
  default: ({ ref, children, onChange, onClose, enablePanDownToClose }: {
    ref: Ref<{ present: () => void; close: () => void }>;
    children: ReactNode;
    onChange?: (index: number) => void;
    onClose?: () => void;
    enablePanDownToClose?: boolean;
  }) => {
    const [open, setOpen] = useState(false);
    const close = () => { setOpen(false); onChange?.(-1); onClose?.(); };
    useImperativeHandle(ref, () => ({
      present: () => { setOpen(true); onChange?.(0); },
      close,
    }));
    if (!open) return null;
    return createElement("div", { role: "dialog", "data-native-sheet": true }, children,
      enablePanDownToClose && createElement("button", { onClick: close, "aria-label": "Swipe down" }),
      enablePanDownToClose && createElement("button", { onClick: close, "aria-label": "System back" }));
  },
  BottomSheetView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({ placeholder, accessibilityLabel, value, onChangeText }: { placeholder: string; accessibilityLabel: string; value?: string; onChangeText?: (value: string) => void }) =>
    createElement("input", { placeholder, "aria-label": accessibilityLabel, value, onInput: (event: { target: { value: string } }) => onChangeText?.(event.target.value) }),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "var(--card)" }));
vi.mock("react-native-svg", () => {
  const Node = ({ children }: { children?: ReactNode }) => createElement("span", null, children);
  return { default: Node, Defs: Node, LinearGradient: Node, Stop: Node, Rect: Node };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) => createElement("span", null, children);
  return { PText: Text, HeadingText: Text, CodeText: Text };
});
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) }));
vi.mock("react-native", () => ({
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
  Platform: { OS: "ios" },
  Keyboard: { dismiss: vi.fn() },
  PixelRatio: { get: () => 3 },
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Modal: ({ children, onRequestClose }: { children: ReactNode; onRequestClose: () => void }) =>
    createElement("div", { role: "dialog" }, children, createElement("button", { onClick: onRequestClose, "aria-label": "System back" })),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  StyleSheet: { absoluteFill: {} },
  View: ({ children, testID, accessibilityLabel }: { children?: ReactNode; testID?: string; accessibilityLabel?: string }) => createElement("div", { "data-testid": testID, "aria-label": accessibilityLabel }, children),
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, onEndReached }: {
    data: unknown[]; renderItem: (info: { item: unknown; index: number }) => ReactNode;
    ListHeaderComponent?: ReactNode; ListEmptyComponent?: ReactNode; ListFooterComponent?: ReactNode; onEndReached?: () => void;
  }) => createElement("div", null, ListHeaderComponent, data.length ? data.map((item, index) =>
    createElement("div", { key: index }, renderItem({ item, index }))) : ListEmptyComponent, ListFooterComponent,
    onEndReached && createElement("button", { "aria-label": "Reach end", onClick: onEndReached })),
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState }: {
    children?: ReactNode; onPress?: () => void; accessibilityLabel?: string; accessibilityState?: { checked?: boolean | "mixed"; selected?: boolean };
  }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-checked": accessibilityState?.checked, "aria-selected": accessibilityState?.selected }, children),
}));
vi.mock("@expo/ui/community/menu", () => ({
  MenuView: ({ children, actions, onPressAction }: {
    children: ReactNode;
    actions: { subactions: { id: string; title: string; state: string }[] }[];
    onPressAction: (event: { nativeEvent: { event: string } }) => void;
  }) => createElement("div", null, children, actions.flatMap((section) => section.subactions.map((option) =>
    createElement("button", {
      key: option.id, "data-branch": option.title, "aria-checked": option.state === "on",
      onClick: () => onPressAction({ nativeEvent: { event: option.id } }),
    }, option.title)))),
}));

let container: HTMLDivElement;
let root: Root;
const click = (label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => button!.click());
};
const selectBranch = (name: string) => {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label^="Branch:"]');
  expect(trigger).not.toBeNull();
  act(() => trigger!.click());
  click(name);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[aria-label^="Branch:"]')?.getAttribute("aria-label")).toBe(`Branch: ${name}`);
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe(name);
};

beforeEach(() => {
  activeTab = "git";
  live.repositoryId = "123";
  remote.query.mockClear(); remote.loadMore.mockClear(); remote.retry.mockClear();
  Object.assign(remote, { isPending: false, isFetching: false, isFetchingNextPage: false, isFetchNextPageError: false, hasNextPage: false, fetchStatus: "idle", error: null });
  live.projectId = "11111111-1111-4111-8111-111111111111";
  live.userId = "user-one";
  live.data = { pages: [{ branches: ["main", "feature/live", "fix/live"], currentBranch: "main", nextCursor: null }] };
  live.query.mockClear();
  live.loadMore.mockClear(); live.retry.mockClear();
  Object.assign(live, { isPending: false, isFetching: false, isFetchingNextPage: false, isFetchNextPageError: false, hasNextPage: false, fetchStatus: "idle", error: null });
  switchTab.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(Workspace)));
});
afterEach(() => act(() => root.unmount()));

it("switches workspace sections through the menu and reflects the active route", () => {
  for (const [name, label] of [["files", "Files"], ["code", "Code"], ["agent", "Agent"], ["git", "Git"]]) {
    const option = container.querySelector<HTMLButtonElement>(`[data-branch="${label}"]`);
    expect(option).not.toBeNull();
    act(() => option!.click());
    expect(switchTab).toHaveBeenLastCalledWith(name, { resetOnFocus: false });
    act(() => root.render(createElement(Workspace)));
    expect(container.querySelector(`[aria-label="Workspace: ${label}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-branch="${label}"]`)?.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelectorAll('[data-branch][aria-checked="true"]')).toHaveLength(1);
  }
});

it("selects real branches while keeping the demo history unchanged", () => {
  click("Commit History");
  const commits = () => [...container.querySelectorAll('[aria-label*="Alex Morgan"], [aria-label*="Sam Chen"]')].map((node) => node.getAttribute("aria-label"));
  const before = commits();
  expect(before).toHaveLength(9);
  expect(container.textContent).toContain("Polish the dashboard layout");
  selectBranch("feature/live");
  expect(container.textContent).toContain("Polish the dashboard layout");
  expect(commits()).toEqual(before);
  selectBranch("fix/live");
  expect(container.textContent).toContain("Polish the dashboard layout");
  expect(commits()).toEqual(before);
  expect(live.query).toHaveBeenCalledWith(live.projectId, expect.any(Object));
});

it("keeps a manual selection across server updates and resets it for another project or account", () => {
  selectBranch("feature/live");
  live.data = { pages: [{ branches: ["release"], currentBranch: "release", nextCursor: null }] };
  act(() => root.render(createElement(Workspace)));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("feature/live");
  live.projectId = "22222222-2222-4222-8222-222222222222";
  act(() => root.render(createElement(Workspace)));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("release");
  live.userId = "user-two";
  live.data = { pages: [{ branches: ["account-branch"], currentBranch: "account-branch", nextCursor: null }] };
  act(() => root.render(createElement(Workspace)));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("account-branch");
});

it("keeps commit presses inert after changing branches", () => {
  click("Commit History");
  selectBranch("fix/live");
  const before = container.textContent;
  const commit = container.querySelector<HTMLButtonElement>('[aria-label^="Polish the dashboard layout,"]');
  expect(commit).not.toBeNull();
  act(() => commit!.click());
  expect(container.textContent).toBe(before);
});


it("shows only the active screen's controls in the lower bar", () => {
  const labels = () => [...container.querySelectorAll("button[aria-label]")]
    .map((button) => button.getAttribute("aria-label"));
  expect(labels()).toContain("Microphone");
  expect(labels()).toContain("Search Git");
  expect(labels()).not.toContain("Undo");
  for (const tab of ["files", "agent", "code"]) {
    activeTab = tab;
    act(() => root.render(createElement(Workspace)));
    expect(labels()).toContain("Microphone");
    expect(container.textContent).not.toContain("Current branch:");
    if (tab === "code") {
      expect(labels()).toEqual(expect.arrayContaining(["Previous file", "Next file", "Undo", "Redo"]));
      expect(labels()).not.toContain("Search activity");
    } else {
      expect(labels()).toContain(tab === "files" ? "Search files" : "Search activity");
      expect(labels()).not.toContain("Previous file");
      expect(labels()).not.toContain("Undo");
      expect(container.querySelector('[data-branch="Folder"]') !== null).toBe(tab === "files");
    }
  }
});


it("dismisses the branch sheet without changing the branch", () => {
  click("Branch: main");
  expect(container.querySelector('[data-native-sheet]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Search branches"]')).not.toBeNull();
  click("Close Branch");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
  click("Branch: main");
  expect(container.querySelector('[aria-label="main"]')?.getAttribute("aria-checked")).toBe("true");
  click("Swipe down");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Branch: main");
  click("System back");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
});


it("replaces the branch pill during search and restores it on dismissal", () => {
  const indicator = () => container.querySelector('[data-testid="branch-indicator"]');
  expect(indicator()?.textContent).toBe("main");
  expect(container.textContent).not.toContain("Current branch:");
  click("Search Git");
  expect(indicator()).toBeNull();
  click("Dismiss search");
  expect(indicator()?.textContent).toBe("main");
});


it("shows changes immediately and keeps tracked and untracked selections without committing", () => {
  expect(container.querySelector('[aria-label="Changes"]')?.getAttribute("aria-selected")).toBe("true");
  expect(container.textContent).not.toContain("No uncommitted changes");
  expect(container.textContent).not.toMatch(/demo|preview/i);
  expect(container.querySelector('[aria-label="Show empty state"]')).toBeNull();
  expect(container.querySelector('[aria-label="Commit message"]')).not.toBeNull();
  const checked = (label: string) => container.querySelector(`[aria-label="${label}"]`)?.getAttribute("aria-checked");
  expect(checked("Select all changes")).toBe("false");
  click("Select tracked changes");
  expect(checked("Select tracked changes")).toBe("true");
  expect(checked("Select untracked changes")).toBe("false");
  expect(checked("Select all changes")).toBe("mixed");
  click("Select all changes");
  expect(checked("Select untracked changes")).toBe("true");
  click("Include src/app/projects/[projectId]/git.tsx");
  expect(checked("Select tracked changes")).toBe("mixed");
  click("Commit History");
  click("Changes");
  expect(checked("Select tracked changes")).toBe("mixed");
  const commit = container.querySelector<HTMLButtonElement>('[aria-label="Commit selected changes"]');
  expect(commit?.disabled).toBe(true);
  const before = container.textContent;
  act(() => commit!.click());
  expect(container.textContent).toBe(before);
});

it("renders the empty state from an empty changes list", () => {
  act(() => root.render(createElement(ProjectWorkspaceDockHeightProvider, null,
    createElement(ProjectChangesPanel, { changes: [] }))));
  expect(container.textContent).toContain("No uncommitted changes");
  expect(container.querySelector('[aria-label="Commit message"]')).toBeNull();
  expect(container.textContent).not.toMatch(/demo|preview/i);
  expect(container.querySelector('[aria-label="Show empty state"]')).toBeNull();
});

it("passes search to the live query, renders its pages, and preserves the selection", () => {
  click("Branch: main");
  const input = container.querySelector<HTMLInputElement>('[aria-label="Search branches"]')!;
  act(() => { input.value = "FIX"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(live.query).toHaveBeenLastCalledWith(live.projectId, { search: "FIX" });
  live.data = { pages: [{ branches: ["server-result"], currentBranch: "main", nextCursor: "next" }, { branches: ["server-result", "next-result"], currentBranch: "main", nextCursor: null }] };
  act(() => root.render(createElement(Workspace)));
  expect(container.querySelectorAll('[aria-label="server-result"]')).toHaveLength(1);
  expect(container.querySelector('[aria-label="next-result"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="feature/live"]')).toBeNull();
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
  click("Reach end");
  expect(live.loadMore).toHaveBeenCalledOnce();
});

it("shows initial loading, no results, and continuation loading states", () => {
  live.data = undefined;
  live.isPending = true;
  act(() => root.render(createElement(Workspace)));
  click("Branch: main");
  expect(container.textContent).toContain("Loading branches…");
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  live.data = { pages: [{ branches: [], currentBranch: null, nextCursor: null }] };
  live.isPending = false;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("No branches found.");
  const input = container.querySelector<HTMLInputElement>('[aria-label="Search branches"]')!;
  act(() => { input.value = "missing"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.textContent).toContain("No matching branches found.");
  live.isFetchingNextPage = true;
  live.isFetching = true;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Loading more branches…");
});

it("offers retry on failure while preserving loaded rows and shows offline status", () => {
  click("Branch: main");
  live.error = new Error("Unable to load project branches. Please try again.");
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Couldn’t refresh branches. Showing previously loaded branches.");
  expect(container.textContent).not.toContain(live.error.message);
  expect(container.querySelector('[aria-label="feature/live"]')).not.toBeNull();
  const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === "Try again")!;
  act(() => retry.click());
  expect(live.retry).toHaveBeenCalledOnce();
  live.error = null; live.fetchStatus = "paused";
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Waiting for a connection…");
});

it("does not invent a default branch for detached HEAD", () => {
  live.data = { pages: [{ branches: ["release"], currentBranch: null, nextCursor: null }] };
  act(() => root.render(createElement(Workspace, { key: "detached" })));
  click("Branch: Select branch");
  expect(container.querySelector('[aria-checked="true"][aria-label="release"]')).toBeNull();
  click("release");
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("release");
});


it("distinguishes initial, continuation, and active refresh states", () => {
  click("Branch: main");
  live.error = new Error("Unable to load project branches. Please try again.");
  live.isFetching = true;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Refreshing branches…");
  expect(container.textContent).not.toContain(live.error.message);
  live.isFetching = false;
  live.isFetchNextPageError = true;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Couldn’t load more branches. Please try again.");
  live.isFetchNextPageError = false;
  live.data = undefined;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain(live.error.message);
});


it("shows separate local and remote lists, shares search, and distinguishes identical branch names", () => {
  click("Branch: main");
  expect(container.textContent).toContain("Local branches");
  expect(container.textContent).toContain("Remote branches");
  expect(remote.query).toHaveBeenLastCalledWith("123", { search: "", enabled: true });
  const input = container.querySelector<HTMLInputElement>('[aria-label="Search branches"]')!;
  act(() => { input.value = "MAIN"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(live.query).toHaveBeenLastCalledWith(live.projectId, { search: "MAIN" });
  expect(remote.query).toHaveBeenLastCalledWith("123", { search: "MAIN", enabled: true });
  click("Remote branch: main");
  click("Branch: main");
  expect(container.querySelector('[aria-label="Remote branch: main"]')?.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector('[aria-label="main"]')?.getAttribute("aria-checked")).toBe("false");
  click("main");
  click("Branch: main");
  expect(container.querySelector('[aria-label="main"]')?.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector('[aria-label="Remote branch: main"]')?.getAttribute("aria-checked")).toBe("false");
});

it("keeps local selection usable when GitHub fails or no repository is connected", () => {
  remote.error = new Error("GitHub is unavailable");
  act(() => root.render(createElement(Workspace)));
  selectBranch("feature/live");
  live.repositoryId = null;
  act(() => root.render(createElement(Workspace)));
  click("Branch: feature/live");
  expect(container.textContent).toContain("No GitHub repository connected.");
  expect(container.querySelector('[aria-label="Remote branch: main"]')).toBeNull();
  expect(remote.query).toHaveBeenLastCalledWith(undefined, { search: "", enabled: false });
});
