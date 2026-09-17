// @vitest-environment happy-dom
import { ProjectWorkspaceDockHeightProvider } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { ProjectWorkspaceFileCreationProvider } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { act, createElement, useImperativeHandle, useState, useRef, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectChangesPanel } from "@/features/projects/components/project-changes-panel";
import GitScreen from "@/app/projects/[projectId]/git/index";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";
import { ProjectWorkspaceBranchProvider } from "@/features/projects/hooks/use-project-workspace-branch";
import { ProjectWorkspaceChangesProvider } from "@/features/projects/hooks/use-project-workspace-changes";
import type { ProjectCommitPageSchema } from "@/features/projects/actions/commit-schemas";

import type { ProjectRepositoryChangesSchema, ProjectRepositoryChangeSchema } from "@/features/projects/actions/change-schemas";

const stashes = vi.hoisted(() => ({
  data: { pages: [{ stashes: [{ index: 0, sha: "c".repeat(40), message: "Saved mobile work", createdAt: "2026-09-16T12:00:00Z" }], patch: null, nextCursor: null }] },
  refetch: vi.fn(), retry: vi.fn(), loadMore: vi.fn(), isFetching: false, isPending: false, hasNextPage: false, fetchStatus: "idle", error: null as Error | null,
  stashDetails: { data: { patch: "diff --git a/test.txt b/test.txt\n+saved change\n", stashes: [], nextCursor: null }, refetch: vi.fn(), isFetching: false, isPending: false, error: null as Error | null, fetchStatus: "idle" },
  gitStash: { mutateAsync: vi.fn() }, gitPopStash: { mutateAsync: vi.fn() },
}));
vi.mock("@/features/projects/hooks/use-project-stashes", () => ({ useProjectStashes: () => stashes }));
const git = vi.hoisted(() => ({
  data: { currentBranch: "main", headSha: "a".repeat(40), upstream: "origin/main", upstreamSha: "b".repeat(40), outgoing: 2, incoming: 3, isShallow: false, observedAt: "2026-09-16T12:00:00Z" },
  isPending: false, isFetching: false, error: null as Error | null, refetch: vi.fn(),
  gitFetch: { mutateAsync: vi.fn() }, gitPush: { mutateAsync: vi.fn() }, gitPull: { mutateAsync: vi.fn() },
}));
vi.mock("@/features/projects/hooks/use-project-git", () => ({ useProjectGit: () => git }));
const changesQuery = vi.hoisted(() => ({
  discardPreview: { refetch: vi.fn() }, gitDiscardChanges: { mutateAsync: vi.fn() },
  query: vi.fn(), refetch: vi.fn(), isPending: false, isFetching: false,
  fetchStatus: "idle", error: null as Error | null,
  data: undefined as ProjectRepositoryChangesSchema | undefined,
}));
vi.mock("@/features/projects/hooks/use-project-changes", () => ({ useProjectChanges: (...args: unknown[]) => { changesQuery.query(...args); return changesQuery; } }));
const change = (path: string, isUntracked = false): ProjectRepositoryChangeSchema => ({
  path, originalPath: null, indexStatus: "unchanged", worktreeStatus: isUntracked ? "untracked" : "modified",
  isUntracked, isConflicted: false, kind: "file", headMode: "100644", indexMode: "100644", worktreeMode: "100644",
  staged: null, unstaged: { patch: "@@ -1 +1,3 @@\n-old\n+one\n+two\n+three\n", additions: 3, deletions: 1, unavailableReason: null },
});
const repositoryChanges = (): ProjectRepositoryChangesSchema => ({
  repositoryState: "ready", currentBranch: "main", headSha: "a".repeat(40), isDetached: false,
  observedAt: "2026-09-13T12:00:00Z",
  changes: [change("src/app/projects/[projectId]/git/index.tsx"), change("src/example.ts"), change("new.txt", true)],
});

const history = vi.hoisted(() => ({
  gitCommit: { mutateAsync: vi.fn(), isPending: false },
  gitUndoLastCommit: { mutateAsync: vi.fn() }, gitRevertLastCommit: { mutateAsync: vi.fn() }, refetch: vi.fn(),
  query: vi.fn(), onLoadMore: vi.fn(), retry: vi.fn(),
  isPending: false, isFetching: false, isFetchingNextPage: false, isFetchNextPageError: false,
  hasNextPage: false, fetchStatus: "idle", error: null as Error | null,
  data: undefined as { pages: ProjectCommitPageSchema[] } | undefined,
}));
vi.mock("@/features/projects/hooks/use-project-commit-history", () => ({ useProjectCommitHistory: (...args: unknown[]) => {
  if (!(args[1] && typeof args[1] === "object" && "enabled" in args[1] && args[1].enabled === false && (!("branch" in args[1]) || ("pageSize" in args[1] && args[1].pageSize === 1)))) history.query(...args);
  return history;
} }));
const commitPage = (message = "Live commit"): ProjectCommitPageSchema => ({
  commits: [{ hash: "a".repeat(40), message, author: "Ada", authorEmail: "ada@example.com", committedAt: "2026-09-12T12:00:00Z", parentHashes: [], isMerge: false }],
  snapshotSha: "a".repeat(40), nextCursor: null, isShallow: false,
});

const live = vi.hoisted(() => ({
  projectId: "11111111-1111-4111-8111-111111111111",
  userId: "user-one",
  repositoryId: "123" as string | null,
  query: vi.fn(),
  gitCheckout: { mutateAsync: vi.fn() },
  gitCreateBranch: { mutateAsync: vi.fn() },
  recoverCheckout: vi.fn(),
  loadMore: vi.fn(), retry: vi.fn(),
  isPending: false, isFetching: false, isFetchingNextPage: false, isFetchNextPageError: false,
  hasNextPage: false, fetchStatus: "idle", error: null as Error | null,
  data: { pages: [{ branches: ["main", "feature/live", "fix/live"], currentBranch: "main" as string | null, nextCursor: null as string | null }] } as { pages: { branches: string[]; currentBranch: string | null; nextCursor: string | null }[] } | undefined,
}));
const workspaceFiles = vi.hoisted(() => ({ flushPendingSaves: vi.fn(), refreshFile: vi.fn(), alert: vi.fn() }));
const feedback = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("@/hooks/use-success-feedback", () => ({ useSuccessFeedback: () => feedback.success }));
vi.mock("@/features/projects/hooks/use-project-file-save", () => ({ useProjectFileSaveRegistry: () => ({ ...workspaceFiles, withSavedFiles: async (action: () => Promise<unknown>) => { await workspaceFiles.flushPendingSaves(); return action(); } }) }));
vi.mock("@/features/projects/hooks/use-project-workspace-current-file", () => ({ useProjectWorkspaceCurrentFile: () => ({ filePath: "app.ts", refreshFile: workspaceFiles.refreshFile }) }));
let queryClient: QueryClient;
const remote = vi.hoisted(() => ({
  query: vi.fn(), loadMore: vi.fn(), retry: vi.fn(),
  isPending: false, isFetching: false, isFetchingNextPage: false, isFetchNextPageError: false,
  hasNextPage: false, fetchStatus: "idle", error: null as Error | null,
  data: { pages: [{ branches: [{ name: "main" }, { name: "remote-only" }], nextCursor: null }] },
}));
vi.mock("@/features/projects/hooks/use-project", () => ({ useProject: () => ({ data: { githubRepositoryId: live.repositoryId }, isPending: false, error: null }) }));
vi.mock("@/services/github/hooks/use-github-repository-branches", () => ({ useGitHubRepositoryBranches: (...args: unknown[]) => { remote.query(...args); return remote; } }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => ({ data: { user: { id: live.userId } }, isPending: false, error: null }) }));
vi.mock("@/features/projects/hooks/use-project-branches", () => ({ useProjectBranches: (...args: unknown[]) => { if (!(args[1] && typeof args[1] === "object" && "enabled" in args[1] && args[1].enabled === false)) live.query(...args); return { ...live, data: live.data }; } }));
let activeTab = "git";
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const switchTab = vi.fn((name: string) => { activeTab = name; });
vi.mock("expo-router", () => ({ useRouter: () => navigation, usePathname: () => `/projects/${live.projectId}/${activeTab}`, useLocalSearchParams: () => ({ projectId: live.projectId }) }));
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
  <QueryClientProvider client={queryClient}>
  <ProjectWorkspaceDockHeightProvider>
    <ProjectWorkspaceBranchProvider>
      <ProjectWorkspaceChangesProvider>
        <GitScreen />
        <ProjectWorkspaceFileCreationProvider projectId="demo">
          <ProjectWorkspaceDock />
        </ProjectWorkspaceFileCreationProvider>
      </ProjectWorkspaceChangesProvider>
    </ProjectWorkspaceBranchProvider>
  </ProjectWorkspaceDockHeightProvider>
  </QueryClientProvider>
);

vi.mock("@/features/projects/hooks/use-workspace-loading-preview", () => ({ useWorkspaceLoadingPreview: () => false }));
vi.mock("@/features/projects/hooks/use-project-workspace-file-search", () => ({ useProjectWorkspaceFileSearch: () => ({
  query: "", setQuery: vi.fn(), title: false, setTitle: vi.fn(), content: false, setContent: vi.fn(),
}) }));
vi.mock("@/features/projects/components/project-workspace-search", () => ({ ProjectWorkspaceSearch: ({ accessibilityLabel, onOpenChange, value, onChangeText }: { accessibilityLabel: string; onOpenChange?: (open: boolean) => void; value?: string; onChangeText?: (value: string) => void }) => {
  const [open, setOpen] = useState(false);
  return createElement("div", null, createElement("button", {
    "aria-label": open ? "Dismiss search" : accessibilityLabel,
    onClick: () => { setOpen(!open); onOpenChange?.(!open); },
  }), open && createElement("input", { "aria-label": "Commit search", value: value ?? "", onInput: (event) => onChangeText?.(event.currentTarget.value) }));
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
  Input: ({ placeholder, accessibilityLabel, value, onChangeText, editable }: { placeholder: string; accessibilityLabel: string; value?: string; onChangeText?: (value: string) => void; editable?: boolean }) =>
    createElement("input", { placeholder, "aria-label": accessibilityLabel, value, readOnly: editable === false, onInput: (event: { target: { value: string } }) => onChangeText?.(event.target.value) }),
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
  Alert: { alert: workspaceFiles.alert },
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
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityState }: {
    children?: ReactNode; onPress?: () => void; disabled?: boolean; accessibilityLabel?: string; accessibilityState?: { checked?: boolean | "mixed"; selected?: boolean };
  }) => createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel, "aria-checked": accessibilityState?.checked, "aria-selected": accessibilityState?.selected }, children),
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
const selectBranch = async (name: string) => {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label^="Branch:"]');
  expect(trigger).not.toBeNull();
  act(() => trigger!.click());
  click(name);
  await act(async () => {});
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[aria-label^="Branch:"]')?.getAttribute("aria-label")).toBe(`Branch: ${name}`);
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe(name);
};

beforeEach(() => {
  git.data.currentBranch = "main";
  changesQuery.discardPreview.refetch.mockReset().mockResolvedValue({ data: { fingerprint: "d".repeat(64), changedPaths: ["file.txt"], currentBranch: "main", headSha: "a".repeat(40) } });
  changesQuery.gitDiscardChanges.mutateAsync.mockReset().mockResolvedValue({ remainingChanges: false });
  history.gitUndoLastCommit.mutateAsync.mockReset().mockResolvedValue({});
  history.gitRevertLastCommit.mutateAsync.mockReset().mockResolvedValue({});
  history.refetch.mockReset().mockImplementation(async () => ({ data: history.data }));

  stashes.gitStash.mutateAsync.mockReset().mockResolvedValue({ created: true, remainingChanges: false });
  stashes.gitPopStash.mutateAsync.mockReset().mockResolvedValue({ dropped: true });
  stashes.refetch.mockReset().mockImplementation(async () => ({ data: stashes.data }));

  git.gitFetch.mutateAsync.mockReset().mockImplementation(async () => git.data);
  git.gitPush.mutateAsync.mockReset().mockResolvedValue({ trackingUpdated: true });
  git.gitPull.mutateAsync.mockReset().mockResolvedValue({});
  git.error = null; git.isPending = false; git.isFetching = false;

  feedback.success.mockReset();
  live.gitCreateBranch.mutateAsync.mockReset().mockImplementation(async ({ branchName }) => ({ currentBranch: branchName, previousBranch: "main" }));
  history.gitCommit.mutateAsync.mockReset().mockResolvedValue({ hash: "b".repeat(40), currentBranch: "main", parentHash: "a".repeat(40) });
  history.gitCommit.isPending = false;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  workspaceFiles.flushPendingSaves.mockReset().mockResolvedValue(undefined);
  workspaceFiles.refreshFile.mockReset(); workspaceFiles.alert.mockReset();
  live.gitCheckout.mutateAsync.mockReset().mockImplementation(async ({ branchName }: { branchName: string }) => ({ previousBranch: "main", currentBranch: branchName }));
  live.recoverCheckout.mockReset().mockResolvedValue({ previousBranch: "main", currentBranch: "feature/live" });
  Object.assign(changesQuery, { data: repositoryChanges(), isPending: false, isFetching: false, fetchStatus: "idle", error: null });
  changesQuery.query.mockClear(); changesQuery.refetch.mockReset().mockImplementation(async () => ({ data: changesQuery.data, isError: false }));
  Object.assign(history, { data: { pages: [commitPage()] }, isPending: false, isFetching: false, isFetchingNextPage: false,
    isFetchNextPageError: false, hasNextPage: false, fetchStatus: "idle", error: null });
  history.query.mockClear(); history.onLoadMore.mockClear(); history.retry.mockClear();
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
afterEach(async () => { await act(async () => root.unmount()); queryClient.clear(); });

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

it("fetches and checks out remote selections before reading their local history", async () => {
  click("Commit History");
  expect(container.textContent).toContain("Live commit");
  expect(history.query).toHaveBeenLastCalledWith(live.projectId, expect.objectContaining({ source: "local", branch: "main", enabled: true }));
  await selectBranch("feature/live");
  expect(history.query).toHaveBeenLastCalledWith(live.projectId, expect.objectContaining({ source: "local", branch: "feature/live" }));
  click("Branch: feature/live");
  click("Remote branch: remote-only");
  await act(async () => {});
  expect(live.gitCheckout.mutateAsync).toHaveBeenLastCalledWith({ branchName: "remote-only", source: "remote" });
  expect(history.query).toHaveBeenLastCalledWith(live.projectId, expect.objectContaining({ source: "local", branch: "remote-only" }));
  expect(container.textContent).not.toContain("Polish the dashboard layout");
});

it("waits for a remote branch to exist locally before loading its history", async () => {
  let finish!: (value: unknown) => void;
  live.gitCheckout.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  click("Commit History");
  click("Branch: main");
  click("Remote branch: remote-only");
  await act(async () => {});
  expect(history.query).toHaveBeenLastCalledWith(live.projectId, expect.objectContaining({ branch: "remote-only", source: "local", enabled: false }));
  expect(container.textContent).toContain("Switching branches…");
  await act(async () => finish({ previousBranch: "main", currentBranch: "remote-only" }));
  expect(history.query).toHaveBeenLastCalledWith(live.projectId, expect.objectContaining({ branch: "remote-only", source: "local", enabled: true }));
});

it("keeps a manual selection across server updates and resets it for another project or account", async () => {
  await selectBranch("feature/live");
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

it("keeps commit presses inert after changing branches", async () => {
  click("Commit History");
  await selectBranch("fix/live");
  const before = container.textContent;
  const commit = container.querySelector<HTMLButtonElement>('[aria-label^="Live commit,"]');
  expect(commit).not.toBeNull();
  act(() => commit!.click());
  expect(container.textContent).toBe(before);
});

it.each(["18: video call stream\n", "18: video call stream\n\nLong commit body", "18: video call stream\r\n"])(
  "renders a compact commit subject without blank lines from the full Git message: %j", (message) => {
    history.data = { pages: [commitPage(message)] };
    click("Commit History");
    const row = container.querySelector('[aria-label^="18: video call stream"]')!;
    const title = [...row.querySelectorAll("span")].find((node) => node.textContent?.startsWith("18: video call stream"));
    expect(title?.textContent).toBe("18: video call stream");
  },
);

it("shows branch loading until the current branch resolves, then preserves selection while refreshing", () => {
  live.data = undefined; live.isPending = true; live.isFetching = true;
  act(() => root.render(createElement(Workspace, { key: "loading-branch" })));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("Loading branches…");
  expect(container.querySelector('[aria-label="Branch: Loading branches…"]')).not.toBeNull();
  click("Commit History");
  expect(container.textContent).not.toContain("Select a branch");
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  live.data = { pages: [{ branches: ["main"], currentBranch: "main", nextCursor: null }] };
  live.isPending = false; live.isFetching = false;
  act(() => root.render(createElement(Workspace, { key: "loading-branch" })));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
  live.isFetching = true;
  act(() => root.render(createElement(Workspace, { key: "loading-branch" })));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
});

it.each(["empty", "failed"])("stops indicating branch loading when the request is %s without a selection", (state) => {
  live.data = state === "empty" ? { pages: [{ branches: [], currentBranch: null, nextCursor: null }] } : undefined;
  live.isPending = false; live.isFetching = false;
  live.error = state === "failed" ? new Error("Unavailable") : null;
  act(() => root.render(createElement(Workspace, { key: state })));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("Select branch");
  click("Commit History");
  expect(container.textContent).toContain("Select a branch");
  expect(container.textContent).not.toContain("Loading branches…");
});

it("shares commit search with the dock, switches to history, and resets it across projects", () => {
  click("Search Git");
  expect(container.querySelector('[aria-label="Commit History"]')?.getAttribute("aria-selected")).toBe("true");
  const input = container.querySelector<HTMLInputElement>('[aria-label="Commit search"]')!;
  act(() => { input.value = "ADA"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(history.query).toHaveBeenLastCalledWith(live.projectId, expect.objectContaining({ search: "ADA", enabled: true }));
  click("Dismiss search"); click("Search Git");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Commit search"]')?.value).toBe("ADA");
  live.projectId = "22222222-2222-4222-8222-222222222222";
  act(() => root.render(createElement(Workspace)));
  expect(history.query).toHaveBeenLastCalledWith(live.projectId, expect.objectContaining({ search: "" }));
});

it("shows real loading, preserves rows during pagination errors, and wires load-more and retry", () => {
  history.data = undefined; history.isPending = true; history.isFetching = true;
  click("Commit History");
  expect(container.textContent).toContain("Loading commits");
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  history.data = { pages: [commitPage(), commitPage()] };
  history.isPending = false; history.isFetching = false; history.hasNextPage = true;
  act(() => root.render(createElement(Workspace)));
  expect(container.querySelectorAll('[aria-label^="Live commit,"]')).toHaveLength(1);
  click("Reach end");
  expect(history.onLoadMore).toHaveBeenCalledOnce();
  history.error = new Error("Unable to load more commits."); history.isFetchNextPageError = true;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Live commit");
  click("Retry commit history");
  expect(history.retry).toHaveBeenCalledOnce();
  history.isFetching = true; history.isFetchingNextPage = true;
  act(() => root.render(createElement(Workspace)));
  expect(container.querySelector('[aria-label="Retry commit history"]')).toBeNull();
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
});

it("distinguishes an unfinished empty search from exhausted history and offline status", () => {
  history.data = { pages: [{ ...commitPage(), commits: [], nextCursor: "more" }] }; history.hasNextPage = true;
  click("Commit History");
  expect(container.textContent).not.toContain("No commits yet");
  click("Continue searching commits");
  expect(history.onLoadMore).toHaveBeenCalledOnce();
  history.hasNextPage = false;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("No commits yet");
  click("Search Git");
  const input = container.querySelector<HTMLInputElement>('[aria-label="Commit search"]')!;
  act(() => { input.value = "missing"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.textContent).toContain("No matching commits");
  history.fetchStatus = "paused";
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Waiting for a connection");
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
  click("Swipe down");
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
  expect(container.querySelector('[aria-label="Commit message"]')).toBeNull();
  expect(container.querySelector('[aria-label="Open commit form"]')?.textContent).toBe("");
  click("Open commit form");
  expect(container.querySelector('[aria-label="Commit message"]')).not.toBeNull();
  const checked = (label: string) => container.querySelector(`[aria-label="${label}"]`)?.getAttribute("aria-checked");
  expect(checked("Select all changes")).toBe("false");
  click("Select tracked changes");
  expect(checked("Select tracked changes")).toBe("true");
  expect(checked("Select untracked changes")).toBe("false");
  expect(checked("Select all changes")).toBe("mixed");
  click("Select all changes");
  expect(checked("Select untracked changes")).toBe("true");
  click("Include src/app/projects/[projectId]/git/index.tsx");
  expect(checked("Select tracked changes")).toBe("mixed");
  click("Swipe down");
  click("Commit History");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Open commit form"]')?.disabled).toBe(false);
  click("Open commit form");
  expect(container.querySelector('[aria-label="Commit message"]')).not.toBeNull();
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Commit selected changes"]')?.disabled).toBe(true);
  click("Swipe down");
  click("Changes");
  expect(container.querySelector('[aria-label="Open commit form"]')).not.toBeNull();
  expect(checked("Select tracked changes")).toBe("mixed");
  click("Open commit form");
  const commit = container.querySelector<HTMLButtonElement>('[aria-label="Commit selected changes"]');
  expect(commit?.disabled).toBe(true);
  const before = container.textContent;
  act(() => commit!.click());
  expect(container.textContent).toBe(before);
});

it("opens the real full diff with live totals without changing the selection", () => {
  click("Select tracked changes");
  expect(container.textContent).toContain("View Full Diff+9−3");
  expect(container.textContent).not.toContain("Unstaged");
  expect(container.textContent).not.toContain("+20");
  click("View Full Diff");
  expect(navigation.push).toHaveBeenCalledWith({
    pathname: "/projects/[projectId]/git/workspace-diff",
    params: { projectId: live.projectId },
  });
  expect(container.querySelector('[aria-label="Select tracked changes"]')?.getAttribute("aria-checked")).toBe("true");
  expect(container.textContent).not.toContain("Checkout:");
});

it.each(["local", "remote"])("opens a history commit from a %s branch with its full SHA and current history source", async (source) => {
  if (source === "remote") {
    click("Branch: main");
    click("Remote branch: remote-only");
    await act(async () => {});
  }
  click("Commit History");
  const commit = container.querySelector<HTMLButtonElement>('[aria-label^="Live commit,"]');
  expect(commit).not.toBeNull();
  act(() => commit!.click());
  expect(navigation.push).toHaveBeenLastCalledWith({
    pathname: "/projects/[projectId]/git/workspace-diff",
    params: { projectId: live.projectId, commitSha: "a".repeat(40), source: "local" },
  });
});

it("renders the empty state from an empty changes list", () => {
  changesQuery.data = { ...repositoryChanges(), changes: [] };
  act(() => root.render(createElement(ProjectWorkspaceDockHeightProvider, null,
    createElement(ProjectWorkspaceChangesProvider, null,
      createElement(ProjectChangesPanel, { projectId: live.projectId })))));
  expect(container.textContent).toContain("No uncommitted changes");
  expect(container.querySelector('[aria-label="Commit message"]')).toBeNull();
  expect(container.querySelector('[aria-label="Open commit form"]')).toBeNull();
  expect(container.querySelector('[aria-label="Refresh project changes"]')).toBeNull();
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
  act(() => container.querySelector<HTMLButtonElement>('[role="dialog"] [aria-label="Reach end"]')!.click());
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


it("shows separate local and remote lists, shares search, and distinguishes identical branch names", async () => {
  click("Branch: main");
  expect(container.textContent).toContain("Local branches");
  expect(container.textContent).toContain("Remote branches");
  expect(remote.query).toHaveBeenLastCalledWith("123", { search: "", enabled: true });
  const input = container.querySelector<HTMLInputElement>('[aria-label="Search branches"]')!;
  act(() => { input.value = "MAIN"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(live.query).toHaveBeenLastCalledWith(live.projectId, { search: "MAIN" });
  expect(remote.query).toHaveBeenLastCalledWith("123", { search: "MAIN", enabled: true });
  click("Remote branch: main");
  await act(async () => {});
  click("Branch: main");
  expect(container.querySelector('[aria-label="Remote branch: main"]')?.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('[aria-label="main"]')?.getAttribute("aria-checked")).toBe("true");
  click("main");
  await act(async () => {});
  click("Branch: main");
  expect(container.querySelector('[aria-label="main"]')?.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector('[aria-label="Remote branch: main"]')?.getAttribute("aria-checked")).toBe("false");
});

it("keeps local selection usable when GitHub fails or no repository is connected", async () => {
  remote.error = new Error("GitHub is unavailable");
  act(() => root.render(createElement(Workspace)));
  await selectBranch("feature/live");
  live.repositoryId = null;
  act(() => root.render(createElement(Workspace)));
  click("Branch: feature/live");
  expect(container.textContent).toContain("No GitHub repository connected.");
  expect(container.querySelector('[aria-label="Remote branch: main"]')).toBeNull();
  expect(remote.query).toHaveBeenLastCalledWith(undefined, { search: "", enabled: false });
});


it("loads changes only while their Git tab is active", () => {
  expect(changesQuery.query).toHaveBeenCalledWith(live.projectId, { enabled: true });
  changesQuery.query.mockClear();
  click("Commit History");
  expect(changesQuery.query).toHaveBeenCalled();
  expect(changesQuery.query.mock.calls.every(([, options]) => options.enabled === false)).toBe(true);
  changesQuery.query.mockClear();
  click("Changes");
  expect(changesQuery.query).toHaveBeenCalledWith(live.projectId, { enabled: true });
});

it("updates the visible branch immediately and disables the picker until checkout succeeds", async () => {
  let finish!: (value: unknown) => void;
  live.gitCheckout.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await selectBranch("feature/live");
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Branch: feature/live"]')!;
  expect(trigger.disabled).toBe(true);
  act(() => trigger.click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(live.gitCheckout.mutateAsync).toHaveBeenCalledExactlyOnceWith({ branchName: "feature/live" });
  await act(async () => finish({ previousBranch: "main", currentBranch: "feature/live" }));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("feature/live");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Branch: feature/live"]')?.disabled).toBe(false);
});

it("reverts a rejected checkout and shows its message", async () => {
  let reject!: (reason: Error) => void;
  live.gitCheckout.mutateAsync.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
  await selectBranch("feature/live");
  await act(async () => reject(new Error("Commit or stash app.ts before switching.")));
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
  expect(workspaceFiles.alert).toHaveBeenCalledWith("Couldn’t switch branches", "Commit or stash app.ts before switching.");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Branch: main"]')?.disabled).toBe(false);
});

it("finishes pending saves before checkout and refreshes only the submitted workspace", async () => {
  let finishSave!: () => void;
  workspaceFiles.flushPendingSaves.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve; }));
  const key = ["projects", "file", live.userId, live.projectId, "app.ts"];
  const otherKey = ["projects", "file", "other-user", live.projectId, "app.ts"];
  queryClient.setQueryData(key, { content: "old branch" });
  queryClient.setQueryData(otherKey, { content: "other account" });
  await selectBranch("feature/live");
  expect(live.gitCheckout.mutateAsync).not.toHaveBeenCalled();
  await act(async () => finishSave());
  expect(live.gitCheckout.mutateAsync).toHaveBeenCalledOnce();
  expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(queryClient.getQueryData(otherKey)).toEqual({ content: "other account" });
  expect(workspaceFiles.refreshFile).toHaveBeenCalledWith("app.ts");
});

it("reverts without checkout when saving fails", async () => {
  workspaceFiles.flushPendingSaves.mockRejectedValueOnce(new Error("Save failed. Open Code to retry."));
  click("Branch: main");
  click("feature/live");
  await act(async () => {});
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
  expect(live.gitCheckout.mutateAsync).not.toHaveBeenCalled();
  expect(workspaceFiles.alert).toHaveBeenCalledWith("Couldn’t switch branches", "Save failed. Open Code to retry.");
});

it("clears old documents after an unknown checkout and retries recovery without another checkout", async () => {
  live.gitCheckout.mutateAsync.mockRejectedValueOnce(Object.assign(new Error("Response lost."), { code: "CHECKOUT_OUTCOME_UNKNOWN" }));
  live.recoverCheckout.mockRejectedValueOnce(new Error("Reconnect to confirm the branch."));
  const fileKey = ["projects", "file", live.userId, live.projectId, "app.ts"];
  const searchKey = ["projects", "file-search", "infinite", live.userId, live.projectId, "old"];
  const branchKey = ["projects", "branches", "infinite", "cursor", live.userId, live.projectId, "local", "old"];
  const otherKey = ["projects", "file", "another-user", live.projectId, "app.ts"];
  for (const key of [fileKey, searchKey, branchKey, otherKey]) queryClient.setQueryData(key, "old bytes");
  click("Branch: main");
  click("feature/live");
  await act(async () => {});
  for (const key of [fileKey, searchKey, branchKey]) expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(queryClient.getQueryData(otherKey)).toBe("old bytes");
  expect(workspaceFiles.refreshFile).toHaveBeenCalledWith("app.ts");
  expect(container.querySelector('[aria-label="Retry branch recovery"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).not.toBe("main");
  click("Retry branch recovery");
  await act(async () => {});
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("feature/live");
  expect(live.gitCheckout.mutateAsync).toHaveBeenCalledOnce();
  expect(live.recoverCheckout).toHaveBeenCalledTimes(2);
});

it("keeps workspace readiness intact while checkout refreshes the root folder", async () => {
  const projectKey = ["projects", "detail", live.userId, live.projectId];
  const filesKey = ["projects", "files", live.userId, live.projectId, ""];
  const project = { setupStatus: "ready", sandboxId: "sandbox-one" };
  queryClient.setQueryData(projectKey, project);
  queryClient.setQueryData(filesKey, [{ path: "app.ts" }]);
  const readProject = vi.fn(async () => project);
  let finishFiles!: (files: { path: string }[]) => void;
  const readFiles = vi.fn(() => new Promise<{ path: string }[]>((resolve) => { finishFiles = resolve; }));
  const projectObserver = new QueryObserver(queryClient, { queryKey: projectKey, queryFn: readProject, staleTime: Infinity });
  const filesObserver = new QueryObserver(queryClient, { queryKey: filesKey, queryFn: readFiles, staleTime: Infinity });
  const projectStates: string[] = [];
  const folderStates: string[] = [];
  const unsubscribeProject = projectObserver.subscribe((result) => projectStates.push(result.status));
  const unsubscribeFiles = filesObserver.subscribe((result) => folderStates.push(result.status));
  try {
    await selectBranch("feature/live");
    expect(readFiles).toHaveBeenCalledOnce();
    // These are the two readiness inputs used by ProjectSetupGate. Neither
    // should revert to pending and display startup after a successful checkout.
    expect(projectStates).not.toContain("pending");
    expect(folderStates).not.toContain("pending");
    expect(readProject).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(filesKey)).toEqual([{ path: "app.ts" }]);
    await act(async () => finishFiles([{ path: "branch-file.ts" }]));
    expect(queryClient.getQueryData(filesKey)).toEqual([{ path: "branch-file.ts" }]);
    expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("feature/live");
    expect(workspaceFiles.alert).not.toHaveBeenCalled();
  } finally {
    unsubscribeProject();
    unsubscribeFiles();
  }
});

it("refreshes branch snapshots without touching project readiness or other workspaces", async () => {
  const localHistoryKey = ["projects", "commits", "infinite", "cursor", live.userId, live.projectId,
    { projectId: live.projectId, source: "local", branch: "main", cursor: null, pageSize: 20 }];
  const remoteHistoryKey = [...localHistoryKey.slice(0, 6), { ...localHistoryKey[6] as object, source: "remote" }];
  const resetKeys = [
    localHistoryKey,
    ["projects", "file-search", "infinite", live.userId, live.projectId, { query: "old" }],
    ["projects", "branches", "infinite", "cursor", live.userId, live.projectId, "local", {}],
    ["projects", "file", live.userId, live.projectId, "app.ts"],
  ];
  const folderKey = ["projects", "files", live.userId, live.projectId, "src"];
  const unchangedKeys = [
    remoteHistoryKey,
    ["projects", "detail", live.userId, live.projectId],
    ["projects", "files", live.userId, "other-project", ""],
    ["projects", "files", "other-user", live.projectId, ""],
  ];
  for (const key of [...resetKeys, folderKey, ...unchangedKeys]) queryClient.setQueryData(key, "cached");
  await selectBranch("feature/live");
  for (const key of resetKeys) expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(queryClient.getQueryData(folderKey)).toBe("cached");
  expect(queryClient.getQueryState(folderKey)?.isInvalidated).toBe(true);
  for (const key of unchangedKeys) {
    expect(queryClient.getQueryData(key)).toBe("cached");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  }
});

it("distinguishes loading, offline, failure, and an uninitialized repository", () => {
  changesQuery.data = undefined; changesQuery.isPending = true; changesQuery.isFetching = true;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Loading changes…");
  expect(container.textContent).not.toContain("No uncommitted changes");
  changesQuery.fetchStatus = "paused"; changesQuery.isFetching = false;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Waiting for a connection…");
  changesQuery.fetchStatus = "idle"; changesQuery.isPending = false; changesQuery.error = new Error("private server detail");
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Unable to load changes");
  expect(container.textContent).not.toContain("private server detail");
  click("Retry project changes");
  expect(changesQuery.refetch).toHaveBeenCalledOnce();
  changesQuery.error = null; changesQuery.data = { ...repositoryChanges(), repositoryState: "not-initialized", currentBranch: null, headSha: null, changes: [] };
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Git is not initialized");
  expect(container.textContent).not.toContain("No uncommitted changes");
});

it("keeps selection and the commit draft through refreshes and reports stale data", () => {
  click("Select tracked changes");
  click("Open commit form");
  const input = container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')!;
  act(() => { input.value = "My draft"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  click("Swipe down");
  changesQuery.isFetching = true;
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).not.toContain("Refreshing changes…");
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  expect(container.querySelector('[aria-label="Refresh project changes"]')).toBeNull();
  changesQuery.isFetching = false; changesQuery.error = new Error("failed");
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("Couldn’t refresh changes. Showing previously loaded changes.");
  expect(container.querySelector('[aria-label="Select tracked changes"]')?.getAttribute("aria-checked")).toBe("true");
  changesQuery.error = null; changesQuery.data = repositoryChanges();
  act(() => root.render(createElement(Workspace)));
  click("Open commit form");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')?.value).toBe("My draft");
  expect(container.querySelector('[aria-label="Refresh project changes"]')).toBeNull();
});

it("drops removed selections and resets draft and selection for another checkout or account", () => {
  click("Select all changes");
  changesQuery.data = { ...repositoryChanges(), changes: [change("new.txt", true)] };
  act(() => root.render(createElement(Workspace)));
  changesQuery.data = repositoryChanges();
  act(() => root.render(createElement(Workspace)));
  expect(container.querySelector('[aria-label="Select tracked changes"]')?.getAttribute("aria-checked")).toBe("false");
  for (const scope of ["checkout", "account", "project"]) {
    click("Select tracked changes");
    click("Open commit form");
    const input = container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')!;
    act(() => { input.value = "Old draft"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    if (scope === "checkout") changesQuery.data = { ...repositoryChanges(), currentBranch: "release" };
    if (scope === "account") live.userId = "other-user";
    if (scope === "project") live.projectId = "22222222-2222-4222-8222-222222222222";
    act(() => root.render(createElement(Workspace)));
    expect(container.querySelector('[aria-label="Select all changes"]')?.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector('[aria-label="Commit message"]')).toBeNull();
    click("Open commit form");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')?.value).toBe("");
    click("Swipe down");
  }
});

it("keeps the file path and change totals on one compact line", () => {
  changesQuery.data = { ...repositoryChanges(), changes: [{ ...change("src/renamed.ts"), originalPath: "old.ts", indexStatus: "renamed",
    staged: { patch: "@@ -1,2 +1,8 @@\n-old\n-old2\n+1\n+2\n+3\n+4\n+5\n+6\n+7\n+8\n", additions: 8, deletions: 2, unavailableReason: null } },
    { ...change("image.png", true), unstaged: { patch: null, additions: null, deletions: null, unavailableReason: "binary" } }] };
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).not.toContain("From old.ts");
  expect(container.textContent).not.toContain("Staged ·");
  expect(container.textContent).not.toContain("Unstaged ·");
  expect(container.textContent).not.toContain("Modified");
  expect(container.textContent).not.toContain("Renamed");
  expect(container.textContent).toContain("src/renamed.ts+11−3");
  expect(container.textContent).toContain("+11");
  expect(container.textContent).toContain("−3");
  expect(container.textContent).not.toContain("Binary file");
  expect(container.textContent).toContain("—");
});

it("keeps the summary to the link and known counts with no scope or preview labels", () => {
  changesQuery.data = { ...repositoryChanges(), changes: [
    { ...change("src/staged.ts"), indexStatus: "modified", unstaged: null,
      staged: { patch: "@@ -1 +1 @@\n-old\n+new\n", additions: 1, deletions: 1, unavailableReason: null } },
    { ...change("image.png"), unstaged: { patch: null, additions: null, deletions: null, unavailableReason: "binary" } },
  ] };
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("View Full Diff+1−1");
  expect(container.textContent).not.toContain("Staged");
  expect(container.textContent).not.toContain("Unstaged");
  expect(container.textContent).not.toContain("preview unavailable");
  expect(container.textContent).not.toContain("+0");
});


it("combines staged and unstaged counts into a single summary", () => {
  changesQuery.data = { ...repositoryChanges(), changes: [
    { ...change("src/both.ts"), indexStatus: "modified",
      staged: { patch: "@@ -1 +1 @@\n-old\n+new\n", additions: 1, deletions: 1, unavailableReason: null } },
  ] };
  act(() => root.render(createElement(Workspace)));
  expect(container.textContent).toContain("View Full Diff+4−2");
  expect(container.textContent).not.toContain("Staged");
  expect(container.textContent).not.toContain("Unstaged");
});

const enterCommitMessage = (message: string) => {
  const input = container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')!;
  act(() => { input.value = message; input.dispatchEvent(new Event("input", { bubbles: true })); });
};
const commitButton = () => container.querySelector<HTMLButtonElement>('[aria-label="Commit selected changes"]')!;

it.each(["API: fix timeout", "fix: handle timeout", "Refactor HTTP client"])("preserves the user's commit message capitalization: %s", async (message) => {
  click("Include new.txt");
  click("Open commit form");
  enterCommitMessage(message);
  expect(container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')?.value).toBe(message);
  click("Commit selected changes");
  await act(async () => {});
  expect(history.gitCommit.mutateAsync).toHaveBeenCalledExactlyOnceWith({ message, paths: ["new.txt"] });
});

it("enables committing only with a valid message and a nonempty selected path list", () => {
  click("Open commit form");
  expect(commitButton().disabled).toBe(true);
  enterCommitMessage("Update files");
  expect(commitButton().disabled).toBe(true);
  click("Select tracked changes");
  expect(commitButton().disabled).toBe(false);
  for (const message of [" ", "x".repeat(5001), "bad\0message"]) {
    enterCommitMessage(message);
    expect(commitButton().disabled).toBe(true);
  }
  expect(history.gitCommit.mutateAsync).not.toHaveBeenCalled();
});

it("submits the latest exact selection after saves and a fresh changes read, then clears the form", async () => {
  click("Include src/example.ts");
  // Swap selection without changing its count.
  act(() => {
    container.querySelector<HTMLButtonElement>('[aria-label="Include src/example.ts"]')!.click();
    container.querySelector<HTMLButtonElement>('[aria-label="Include new.txt"]')!.click();
  });
  click("Open commit form");
  enterCommitMessage("  Commit new file  ");
  click("Commit selected changes");
  await act(async () => {});
  expect(history.gitCommit.mutateAsync).toHaveBeenCalledExactlyOnceWith({ message: "Commit new file", paths: ["new.txt"] });
  expect(workspaceFiles.flushPendingSaves.mock.invocationCallOrder[0]).toBeLessThan(changesQuery.refetch.mock.invocationCallOrder[0]);
  expect(changesQuery.refetch.mock.invocationCallOrder[0]).toBeLessThan(history.gitCommit.mutateAsync.mock.invocationCallOrder[0]);
  expect(feedback.success).toHaveBeenCalledWith("Selected changes committed.");
  expect(container.querySelector('[aria-label="Commit message"]')).toBeNull();
  expect(container.querySelector('[aria-label="Select all changes"]')?.getAttribute("aria-checked")).toBe("false");
  click("Open commit form");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')?.value).toBe("");
});

it("blocks repeated submission while saves or the commit are pending", async () => {
  let finishSave!: () => void;
  let finishCommit!: (value: unknown) => void;
  workspaceFiles.flushPendingSaves.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve; }));
  history.gitCommit.mutateAsync.mockImplementationOnce(() => new Promise((resolve) => { finishCommit = resolve; }));
  click("Select all changes"); click("Open commit form"); enterCommitMessage("Update");
  act(() => { commitButton().click(); commitButton().click(); });
  expect(commitButton().disabled).toBe(true);
  expect(workspaceFiles.flushPendingSaves).toHaveBeenCalledOnce();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')?.readOnly).toBe(true);
  expect(history.gitCommit.mutateAsync).not.toHaveBeenCalled();
  await act(async () => { finishSave(); });
  expect(commitButton().disabled).toBe(true);
  expect(history.gitCommit.mutateAsync).toHaveBeenCalledOnce();
  await act(async () => { finishCommit({ hash: "b".repeat(40) }); });
});

it.each(["save", "commit"])("keeps the draft and selection when %s fails", async (stage) => {
  const failure = new Error(stage === "save" ? "Save failed." : "Commit outcome unknown. Refresh before retrying.");
  (stage === "save" ? workspaceFiles.flushPendingSaves : history.gitCommit.mutateAsync).mockRejectedValueOnce(failure);
  click("Select tracked changes"); click("Open commit form"); enterCommitMessage("My draft");
  click("Commit selected changes");
  await act(async () => {});
  expect(workspaceFiles.alert).toHaveBeenCalledWith("Unable to commit", failure.message);
  expect(container.querySelector<HTMLInputElement>('[aria-label="Commit message"]')?.value).toBe("My draft");
  expect(container.querySelector('[aria-label="Select tracked changes"]')?.getAttribute("aria-checked")).toBe("true");
  expect(feedback.success).not.toHaveBeenCalled();
  if (stage === "save") expect(history.gitCommit.mutateAsync).not.toHaveBeenCalled();
});

it.each(["missing-path", "branch", "head", "error"])("rejects a stale %s after saving and refreshing", async (kind) => {
  const fresh = repositoryChanges();
  if (kind === "missing-path") fresh.changes = [];
  if (kind === "branch") fresh.currentBranch = "other";
  if (kind === "head") fresh.headSha = "c".repeat(40);
  changesQuery.refetch.mockResolvedValueOnce({ data: fresh, isError: kind === "error" });
  click("Select tracked changes"); click("Open commit form"); enterCommitMessage("Update");
  click("Commit selected changes");
  await act(async () => {});
  expect(history.gitCommit.mutateAsync).not.toHaveBeenCalled();
  expect(workspaceFiles.alert).toHaveBeenCalled();
});

it.each(["loading", "error", "offline", "detached", "conflicted", "unsupported"])("disables commit submission when changes are %s", (state) => {
  click("Select tracked changes"); click("Open commit form"); enterCommitMessage("Update");
  if (state === "loading") changesQuery.isFetching = true;
  if (state === "error") changesQuery.error = new Error("failed");
  if (state === "offline") changesQuery.fetchStatus = "paused";
  if (state === "detached") changesQuery.data = { ...repositoryChanges(), isDetached: true };
  if (state === "conflicted") changesQuery.data!.changes[0].isConflicted = true;
  if (state === "unsupported") changesQuery.data!.changes[0].kind = "symlink";
  act(() => root.render(createElement(Workspace)));
  expect(commitButton().disabled).toBe(true);
});

it("does not submit if the form's workspace changes while saves are pending", async () => {
  let finishSave!: () => void;
  workspaceFiles.flushPendingSaves.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve; }));
  click("Select tracked changes"); click("Open commit form"); enterCommitMessage("Update");
  click("Commit selected changes");
  live.projectId = "22222222-2222-4222-8222-222222222222";
  act(() => root.render(createElement(Workspace)));
  await act(async () => { finishSave(); });
  expect(history.gitCommit.mutateAsync).not.toHaveBeenCalled();
});

const openBranchActions = () => {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label^="Branch actions:"]')!;
  act(() => trigger.click());
};
it("renders live outgoing and incoming counts", () => {
  expect(container.querySelector('[aria-label^="Branch actions:"]')?.getAttribute("aria-label")).toContain("2 to push, 3 to pull");
});
it.each(["Push 2", "Pull 3", "Pull Rebase", "Fetch"])("runs %s after saves and reports success", async (label) => {
  openBranchActions(); click(label);
  await act(async () => {});
  const mutation = label === "Fetch" ? git.gitFetch : label.startsWith("Pull") ? git.gitPull : git.gitPush;
  expect(mutation.mutateAsync).toHaveBeenCalledOnce();
  expect(workspaceFiles.flushPendingSaves.mock.invocationCallOrder[0]).toBeLessThan(mutation.mutateAsync.mock.invocationCallOrder[0]);
  expect(feedback.success).toHaveBeenCalledOnce();
  if (label === "Pull Rebase") expect(mutation.mutateAsync).toHaveBeenCalledWith({ rebase: true });
});
it("confirms force push against a freshly fetched remote SHA", async () => {
  openBranchActions(); click("Force Push"); await act(async () => {});
  expect(git.gitFetch.mutateAsync).toHaveBeenCalledOnce();
  expect(git.gitPush.mutateAsync).not.toHaveBeenCalled();
  const buttons = workspaceFiles.alert.mock.calls.at(-1)![2];
  await act(async () => buttons.find((button: { text: string }) => button.text === "Force Push").onPress());
  expect(git.gitPush.mutateAsync).toHaveBeenCalledWith({ force: true, expectedRemoteSha: "b".repeat(40) });
});
it("blocks sync after save failure and presents the failure", async () => {
  workspaceFiles.flushPendingSaves.mockRejectedValueOnce(new Error("Save failed"));
  openBranchActions(); click("Push 2"); await act(async () => {});
  expect(git.gitPush.mutateAsync).not.toHaveBeenCalled();
  expect(workspaceFiles.alert).toHaveBeenCalledWith(expect.any(String), "Save failed");
  expect(feedback.success).not.toHaveBeenCalled();
});
it("cancels a pending force push confirmation after switching accounts", async () => {
  openBranchActions(); click("Force Push"); await act(async () => {});
  const buttons = workspaceFiles.alert.mock.calls.at(-1)![2];
  live.userId = "user-two"; act(() => root.render(<Workspace />));
  await act(async () => buttons.find((button: { text: string }) => button.text === "Force Push").onPress());
  expect(git.gitPush.mutateAsync).not.toHaveBeenCalled();
});

const enterBranchName = (value: string) => {
  const input = container.querySelector<HTMLInputElement>('[aria-label="Search branches"]')!;
  act(() => { input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); });
};
it("creates a branch from the current workspace and selects the confirmed result", async () => {
  act(() => container.querySelector<HTMLButtonElement>('[aria-label^="Branch:"]')!.click());
  enterBranchName("feature/new-work"); click("Create branch"); await act(async () => {});
  expect(live.gitCreateBranch.mutateAsync).toHaveBeenCalledExactlyOnceWith({ branchName: "feature/new-work" });
  expect(workspaceFiles.flushPendingSaves.mock.invocationCallOrder[0]).toBeLessThan(live.gitCreateBranch.mutateAsync.mock.invocationCallOrder[0]);
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("feature/new-work");
  expect(feedback.success).toHaveBeenCalledWith("Branch created and checked out.");
});
it("disables invalid branch names and retains the name after server rejection", async () => {
  act(() => container.querySelector<HTMLButtonElement>('[aria-label^="Branch:"]')!.click());
  enterBranchName("bad..name");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Create branch"]')!.disabled).toBe(true);
  enterBranchName("already-exists");
  live.gitCreateBranch.mutateAsync.mockRejectedValueOnce(new Error("A branch with that name already exists."));
  click("Create branch"); await act(async () => {});
  expect(workspaceFiles.alert).toHaveBeenCalledWith("Git operation failed", "A branch with that name already exists.");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Search branches"]')!.value).toBe("already-exists");
});

const confirmAlert = async (label: string) => {
  const buttons = workspaceFiles.alert.mock.calls.at(-1)![2];
  await act(async () => buttons.find((button: { text: string }) => button.text === label).onPress());
};
it("stashes saved tracked and untracked changes only after confirmation", async () => {
  click("Other Options"); click("Stash All"); await act(async () => {});
  expect(stashes.gitStash.mutateAsync).not.toHaveBeenCalled();
  await confirmAlert("Stash All");
  expect(stashes.gitStash.mutateAsync).toHaveBeenCalledWith({});
  expect(feedback.success).toHaveBeenCalledWith("Changes saved in a stash.");
});
it("refreshes the latest stash and confirms its identity before popping", async () => {
  click("Other Options"); click("Pop Stash"); await act(async () => {});
  expect(stashes.refetch).toHaveBeenCalledOnce();
  expect(stashes.gitPopStash.mutateAsync).not.toHaveBeenCalled();
  await confirmAlert("Pop Stash");
  expect(stashes.gitPopStash.mutateAsync).toHaveBeenCalledWith({ stashIndex: 0, stashSha: "c".repeat(40), restoreIndex: false });
});
it("browses saved stashes and opens their patch", async () => {
  click("Other Options"); click("View Stash"); await act(async () => {});
  click("View stash 0"); await act(async () => {});
  expect(container.textContent).toContain("+saved change");
  expect(container.querySelector('[aria-label="Pop selected stash"]')).not.toBeNull();
});
it("shows stash conflicts without a success toast", async () => {
  stashes.gitPopStash.mutateAsync.mockRejectedValueOnce(new Error("Conflicts found. Your stash was retained."));
  click("Other Options"); click("Pop Stash"); await act(async () => {}); await confirmAlert("Pop Stash");
  expect(workspaceFiles.alert).toHaveBeenLastCalledWith("Git operation failed", "Conflicts found. Your stash was retained.");
  expect(feedback.success).not.toHaveBeenCalled();
});

it("uses the discard fingerprint only after the destructive confirmation", async () => {
  click("Other Options"); click("Discard Changes"); await act(async () => {});
  click("Discard tracked and untracked changes"); await act(async () => {});
  expect(changesQuery.gitDiscardChanges.mutateAsync).not.toHaveBeenCalled();
  await confirmAlert("Discard Changes");
  expect(changesQuery.gitDiscardChanges.mutateAsync).toHaveBeenCalledWith({ fingerprint: "d".repeat(64), confirm: true, includeUntracked: true });
});
it.each([["Keep changes staged", "soft"], ["Keep changes unstaged", "mixed"], ["Discard commit changes", "hard"]])("confirms undo mode: %s", async (label, mode) => {
  history.data!.pages[0].commits[0].parentHashes = ["b".repeat(40)];
  click("Other Options"); click("Undo Last Commit"); await act(async () => {});
  click(label); await act(async () => {});
  expect(history.gitUndoLastCommit.mutateAsync).not.toHaveBeenCalled();
  await confirmAlert("Undo Commit");
  expect(history.gitUndoLastCommit.mutateAsync).toHaveBeenCalledWith({ mode });
});
it("confirms reverting a merge relative to its first parent", async () => {
  history.data!.pages[0].commits[0].parentHashes = ["b".repeat(40), "c".repeat(40)];
  click("Other Options"); click("Revert Last Commit"); await act(async () => {});
  expect(workspaceFiles.alert.mock.calls.at(-1)![1]).toContain("first parent");
  await confirmAlert("Revert Commit");
  expect(history.gitRevertLastCommit.mutateAsync).toHaveBeenCalledWith({ mainline: 1 });
});
it("rejects a changed HEAD after confirming undo", async () => {
  history.data!.pages[0].commits[0].parentHashes = ["b".repeat(40)];
  click("Other Options"); click("Undo Last Commit"); await act(async () => {});
  click("Keep changes unstaged"); await act(async () => {});
  history.data = { pages: [{ ...commitPage(), commits: [{ ...commitPage().commits[0], hash: "e".repeat(40) }] }] };
  await confirmAlert("Undo Commit");
  expect(history.gitUndoLastCommit.mutateAsync).not.toHaveBeenCalled();
  expect(workspaceFiles.alert.mock.calls.at(-1)![1]).toContain("changed");
});

it("hides stale counts belonging to another branch", () => {
  git.data.currentBranch = "old-branch";
  act(() => root.render(<Workspace />));
  expect(container.querySelector('[aria-label^="Branch actions:"]')?.getAttribute("aria-label")).toContain("— to push, — to pull");
  git.data.currentBranch = "main";
});

it("keeps remote operations disabled without a connected repository", () => {
  live.repositoryId = null;
  act(() => root.render(<Workspace />));
  openBranchActions();
  for (const label of ["Push 2", "Pull 3", "Force Push", "Pull Rebase", "Fetch"])
    expect(container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.disabled).toBe(true);
});

it("serializes repeated sync presses and disables dependent controls", async () => {
  let finish!: () => void;
  git.gitPull.mutateAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  openBranchActions(); click("Pull 3"); await act(async () => {});
  for (const label of ["Push 2", "Pull 3", "Force Push", "Fetch"])
    expect(container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.disabled).toBe(true);
  click("Pull 3");
  expect(git.gitPull.mutateAsync).toHaveBeenCalledOnce();
  await act(async () => finish());
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Pull 3"]')?.disabled).toBe(false);
});

it("cancels stash without changing Git or showing success", async () => {
  click("Other Options"); click("Stash All"); await act(async () => {});
  await confirmAlert("Cancel");
  expect(stashes.gitStash.mutateAsync).not.toHaveBeenCalled();
  expect(feedback.success).not.toHaveBeenCalled();
});

it("refreshes file contents after pull conflicts without success feedback", async () => {
  git.gitPull.mutateAsync.mockRejectedValueOnce(new Error("Resolve conflicts before continuing."));
  openBranchActions(); click("Pull 3"); await act(async () => {});
  expect(workspaceFiles.refreshFile).toHaveBeenCalledWith("app.ts");
  expect(feedback.success).not.toHaveBeenCalled();
  expect(workspaceFiles.alert).toHaveBeenLastCalledWith("Git operation failed", "Resolve conflicts before continuing.");
});
