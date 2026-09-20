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
  navigate: vi.fn(),
  headerOptions: {} as { headerTitle?: string; headerBackVisible?: boolean; headerLeft?: () => ReactNode },
  readFiles: vi.fn(),
  query: {
    data: undefined as { name: string; setupStatus: string } | undefined,
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
  useRouter: () => ({ dismissTo: state.dismissTo, navigate: state.navigate }),
  Stack: { Screen: ({ options }: { options: typeof state.headerOptions }) => { state.headerOptions = options; return null; } },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: ({ accessibilityLabel }: { accessibilityLabel: string }) => <span role="progressbar" aria-label={accessibilityLabel} />,
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
  state.navigate.mockClear();
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

it.each(["code", "files", "git", "agent"])("keeps the editor header stable behind %s and nested modal diffs", async (section) => {
  state.query.data = { name: "Example", setupStatus: "ready" };
  state.segments = ["projects", "[projectId]", section];
  await render();
  expect(state.headerOptions.headerTitle).toBe("Example");
  state.segments = ["projects", "[projectId]", "git", "workspace-diff"];
  state.commitParams = { commitSha: "a".repeat(40), source: "local" };
  await render();
  expect(state.headerOptions.headerTitle).toBe("Example");
  act(() => root.render(state.headerOptions.headerLeft?.()));
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Home"]')!.click());
  expect(state.dismissTo).toHaveBeenLastCalledWith("/(main)");
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
  expect(container.querySelector('[aria-label="Opening local workspace"]')).not.toBeNull();
  expect(state.readFiles).not.toHaveBeenCalled();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
});

it.each(["pending", "running", "failed"])("blocks workspace routes while setup is %s, even with a sandbox ID", async (setupStatus) => {
  state.query.data = { name: "Example", setupStatus };
  await render();
  expect(state.readFiles).not.toHaveBeenCalled();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  if (setupStatus === "failed") expect(container.textContent).toContain("Workspace setup couldn’t finish");
  else expect(container.querySelector('[aria-label="Opening local workspace"]')).not.toBeNull();
});

it("opens the requested child when setup and the workspace become ready, and removes it if setup regresses", async () => {
  state.query.data = { name: "Example", setupStatus: "running" };
  await render();
  state.query.data = { ...state.query.data, setupStatus: "ready" };
  await render();
  expect(container.textContent).toBe("Requested workspace route");
  state.query.data = { ...state.query.data, setupStatus: "pending" };
  await render();
  expect(container.textContent).not.toContain("Requested workspace route");
});

it("blocks a stale ready result on a query error and offers a retry", async () => {
  state.query.data = { name: "Example", setupStatus: "ready" };
  state.query.isError = true;
  await render();
  expect(state.readFiles).not.toHaveBeenCalled();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Unable to load your workspace");
  act(() => container.querySelector("button")?.click());
  expect(state.query.refetch).toHaveBeenCalledOnce();
});

it("verifies a cached workspace after pending setup becomes ready", async () => {
  client.setQueryData(["projects", "files", "project-one", ""], []);
  state.query.data = { name: "Example", setupStatus: "running" };
  await render();
  expect(state.readFiles).not.toHaveBeenCalled();
  state.query.data = { ...state.query.data, setupStatus: "ready" };
  await render();
  expect(state.readFiles).toHaveBeenCalledOnce();
  expect(container.textContent).toBe("Requested workspace route");
});

it("keeps terminal workspace errors outside the tabs without automatic retries", async () => {
  state.query.data = { name: "Example", setupStatus: "ready" };
  state.readFiles.mockResolvedValue(null);
  await render();
  await advance(30_000);
  expect(state.readFiles).toHaveBeenCalledOnce();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Unable to open this local workspace");
});

it("keeps workspace routes mounted during ordinary background folder refreshes", async () => {
  state.query.data = { name: "Example", setupStatus: "ready" };
  await render();
  const workspace = container.querySelector("p");
  state.readFiles.mockImplementationOnce(() => new Promise(() => {}));
  await act(async () => { void client.invalidateQueries({ queryKey: ["projects", "files", "project-one", ""] }); });
  await advance();
  expect(container.textContent).toBe("Requested workspace route");
  expect(container.querySelector("p")).toBe(workspace);
});
