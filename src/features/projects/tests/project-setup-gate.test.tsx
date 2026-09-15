// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ProjectSetupGate } from "@/features/projects/components/project-setup-gate";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";

const state = vi.hoisted(() => ({
  projectId: "project-one",
  segments: ["projects", "[projectId]", "files"],
  commitParams: {} as { commitSha?: string | string[]; source?: string | string[] },
  dismissTo: vi.fn(),
  headerOptions: {} as { headerTitle?: string; headerBackVisible?: boolean; headerLeft?: () => ReactNode },
  readFiles: vi.fn(),
  query: {
    data: undefined as { name: string; setupStatus: string; sandboxId: string | null } | undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  renderWorkspace: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ projectId: state.projectId }),
  useGlobalSearchParams: () => state.commitParams,
  useSegments: () => state.segments,
  useRouter: () => ({ dismissTo: state.dismissTo }),
  Stack: { Screen: ({ options }: { options: typeof state.headerOptions }) => { state.headerOptions = options; return null; } },
}));
vi.mock("react-native", () => ({
  View: ({ children, style }: { children?: ReactNode; style?: Record<string, unknown> }) => createElement("div", { style }, children),
  Pressable: ({ children, onPress, accessibilityLabel }: { children?: ReactNode; onPress: () => void; accessibilityLabel?: string }) => <button aria-label={accessibilityLabel} onClick={onPress}>{children}</button>,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 60, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "transparent" }));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) => createElement("p", null, children),
  HeadingText: ({ children }: { children?: ReactNode }) => createElement("h1", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, disabled }: { children?: ReactNode; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, children),
}));
vi.mock("@/features/projects/hooks/use-project", () => ({ useProject: () => state.query }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => ({ isPending: false, error: null, data: { user: { id: "user-one" } } }) }));
vi.mock("@/features/projects/actions/file-actions", () => ({ readProjectFilesAction: state.readFiles }));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement("div", null, children) },
  FadeIn: { duration: () => ({ reduceMotion: () => undefined }) },
  ReduceMotion: { System: "system" },
}));
vi.mock("@/features/projects/components/sandbox-scaffold", () => ({ SandboxScaffold: () => null }));
vi.mock("@/features/projects/components/sandbox-files", () => ({ SandboxFiles: () => null }));

const Workspace = () => {
  useProjectFiles(state.projectId, "");
  state.renderWorkspace();
  return createElement("p", null, "Requested workspace route");
};
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const advance = async (ms = 1) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};
const render = async () => {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ProjectSetupGate, null, createElement(Workspace)))));
  await advance();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.projectId = "project-one";
  state.segments = ["projects", "[projectId]", "files"];
  state.commitParams = {};
  state.dismissTo.mockClear();
  state.readFiles.mockReset().mockResolvedValue([]);
  Object.assign(state.query, { data: undefined, isError: false, isFetching: false });
});

it("provides an explicit home action while the workspace is loading", async () => {
  await render();
  expect(state.headerOptions.headerBackVisible).toBe(false);
  act(() => root.render(state.headerOptions.headerLeft?.()));
  const home = container.querySelector<HTMLButtonElement>('[aria-label="Home"]');
  expect(home?.querySelector('[data-icon="home"]')).not.toBeNull();
  act(() => home!.click());
  expect(state.dismissTo).toHaveBeenCalledWith("/(main)");
});

it.each(["local", "remote"])("uses the short SHA for a %s commit and restores the normal titles on navigation", async (source) => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.segments = ["projects", "[projectId]", "git", "workspace-diff"];
  state.commitParams = { commitSha: "40d01ac" + "a".repeat(33), source };
  await render();
  expect(state.headerOptions.headerTitle).toBe("40d01ac");
  state.commitParams = { commitSha: "b".repeat(40), source };
  await render();
  expect(state.headerOptions.headerTitle).toBe("bbbbbbb");
  state.commitParams = {};
  await render();
  expect(state.headerOptions.headerTitle).toBe("Workspace diff");
  state.segments = ["projects", "[projectId]", "git"];
  await render();
  expect(state.headerOptions.headerTitle).toBe("Example");
});

it.each([
  { commitSha: "a".repeat(40) }, { source: "local" },
  { commitSha: ["a".repeat(40)], source: "local" },
  { commitSha: "a".repeat(40), source: "invalid" },
])("keeps the workspace title for incomplete commit parameters: %j", async (params) => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.segments = ["projects", "[projectId]", "git", "workspace-diff"];
  state.commitParams = params;
  await render();
  expect(state.headerOptions.headerTitle).toBe("Workspace diff");
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

it("does not mount a requested child route before the project loads", async () => {
  await render();
  expect(container.textContent).toContain("We’re starting your workspace");
  expect(state.readFiles).not.toHaveBeenCalled();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
});

it.each(["pending", "running", "failed"])("blocks workspace routes while setup is %s, even with a sandbox ID", async (setupStatus) => {
  state.query.data = { name: "Example", setupStatus, sandboxId: "sandbox-one" };
  await render();
  expect(state.readFiles).not.toHaveBeenCalled();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain(setupStatus === "failed" ? "Workspace setup couldn’t finish" : "We’re scaffolding your workspace");
});

it("opens the requested child when setup and the workspace become ready, and removes it if setup regresses", async () => {
  state.query.data = { name: "Example", setupStatus: "running", sandboxId: "sandbox-one" };
  await render();
  state.query.data = { ...state.query.data, setupStatus: "ready" };
  await render();
  expect(container.textContent).toBe("Requested workspace route");
  state.query.data = { ...state.query.data, setupStatus: "pending" };
  await render();
  expect(container.textContent).not.toContain("Requested workspace route");
});

it("blocks a stale ready result on a query error and offers a retry", async () => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.query.isError = true;
  await render();
  expect(state.readFiles).not.toHaveBeenCalled();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Unable to load your workspace");
  act(() => container.querySelector("button")?.click());
  expect(state.query.refetch).toHaveBeenCalledOnce();
});

it.each([false, true])("blocks the entire workspace through restoration retries (cached files: %s)", async (cached) => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  if (cached) client.setQueryData(["projects", "files", "user-one", "project-one", ""], []);
  state.readFiles.mockImplementationOnce(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  });
  await render();
  expect(state.readFiles).toHaveBeenCalledOnce();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain("We’re starting your workspace");
  await advance(2998);
  expect(state.readFiles).toHaveBeenCalledOnce();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  await advance(3);
  expect(container.textContent).toBe("Requested workspace route");
  // Files reuses the gate's successful root read without another loading request.
  expect(state.readFiles).toHaveBeenCalledTimes(2);
});

it("verifies a cached workspace after pending setup becomes ready", async () => {
  client.setQueryData(["projects", "files", "user-one", "project-one", ""], []);
  state.query.data = { name: "Example", setupStatus: "running", sandboxId: "sandbox-one" };
  await render();
  expect(state.readFiles).not.toHaveBeenCalled();
  state.query.data = { ...state.query.data, setupStatus: "ready" };
  await render();
  expect(state.readFiles).toHaveBeenCalledOnce();
  expect(container.textContent).toBe("Requested workspace route");
});

it.each([false, true])("opens a long restoration without leaving or pressing refresh (cached files: %s)", async (cached) => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  if (cached) client.setQueryData(["projects", "files", "user-one", "project-one", ""], []);
  state.readFiles.mockImplementation(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  });
  await render();
  await advance(90_001);
  expect(state.readFiles.mock.calls.length).toBeGreaterThan(21);
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain("We’re starting your workspace");
  state.readFiles.mockResolvedValue([]);
  await advance(3_001);
  expect(state.query.refetch).not.toHaveBeenCalled();
  expect(container.textContent).toBe("Requested workspace route");
  const completedReads = state.readFiles.mock.calls.length;
  await advance(30_000);
  expect(state.readFiles).toHaveBeenCalledTimes(completedReads);
});

it.each(["connectivity", "focus"])("resumes restoration automatically when %s returns", async (pause) => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.readFiles.mockImplementationOnce(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  });
  await render();
  await act(async () => {
    if (pause === "connectivity") onlineManager.setOnline(false);
    else focusManager.setFocused(false);
  });
  await advance(10_000);
  expect(state.readFiles).toHaveBeenCalledOnce();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  await act(async () => {
    if (pause === "connectivity") onlineManager.setOnline(true);
    else focusManager.setFocused(true);
  });
  await advance();
  expect(container.textContent).toBe("Requested workspace route");
  expect(state.readFiles).toHaveBeenCalledTimes(2);
});

it("ends restoration checks on a real failure and allows an explicit retry", async () => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.readFiles.mockImplementationOnce(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  }).mockResolvedValue(null);
  await render();
  await advance(3_001);
  expect(container.textContent).toContain("Unable to start your workspace");
  await advance(30_000);
  expect(state.readFiles).toHaveBeenCalledTimes(2);
  state.readFiles.mockResolvedValue([]);
  await act(async () => container.querySelector("button")?.click());
  await advance();
  expect(container.textContent).toBe("Requested workspace route");
});

it("cancels long restoration checks when the workspace screen unmounts", async () => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.readFiles.mockImplementation(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  });
  await render();
  await advance(90_001);
  const attempts = state.readFiles.mock.calls.length;
  const signal = state.readFiles.mock.calls.at(-1)![2] as AbortSignal;
  await act(async () => root.render(null));
  await advance(30_000);
  expect(signal.aborted).toBe(true);
  expect(state.readFiles).toHaveBeenCalledTimes(attempts);
});

it("keeps terminal workspace errors outside the tabs without automatic retries", async () => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.readFiles.mockResolvedValue(null);
  await render();
  await advance(30_000);
  expect(state.readFiles).toHaveBeenCalledOnce();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Unable to start your workspace");
});

it("cancels restoration for the previous project when navigation changes", async () => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.readFiles.mockImplementationOnce(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  });
  await render();
  const signal = state.readFiles.mock.calls[0][2] as AbortSignal;
  state.projectId = "project-two";
  state.query.data = { ...state.query.data, sandboxId: "sandbox-two" };
  await render();
  await advance(10_000);
  expect(signal.aborted).toBe(true);
  expect(state.readFiles.mock.calls.filter(([id]) => id === "project-one")).toHaveLength(1);
  expect(container.textContent).toBe("Requested workspace route");
});

it("keeps workspace routes mounted during ordinary background folder refreshes", async () => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  await render();
  const workspace = container.querySelector("p");
  state.readFiles.mockImplementationOnce(() => new Promise(() => {}));
  await act(async () => { void client.invalidateQueries({ queryKey: ["projects", "files", "user-one", "project-one", ""] }); });
  await advance();
  expect(container.textContent).toBe("Requested workspace route");
  expect(container.querySelector("p")).toBe(workspace);
});

it("hides existing tabs during a later restoration without discarding their mounted state", async () => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  await render();
  const workspace = container.querySelector("p");
  state.readFiles.mockImplementationOnce(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  });
  await act(async () => { void client.invalidateQueries({ queryKey: ["projects", "files", "user-one", "project-one", ""] }); });
  await advance();
  expect(container.textContent).toContain("We’re starting your workspace");
  expect(container.contains(workspace)).toBe(true);
  expect(workspace?.closest('[style*="display: none"]')).not.toBeNull();
  await advance(3001);
  expect(container.textContent).toBe("Requested workspace route");
  expect(container.querySelector("p")).toBe(workspace);
  expect(workspace?.closest('[style*="display: none"]')).toBeNull();
});
