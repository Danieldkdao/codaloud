// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GitLayout from "@/app/projects/[projectId]/git/_layout";

const state = vi.hoisted(() => ({
  route: "index", commitParams: {} as Record<string, unknown>,
  dismissTo: vi.fn(), dismissKeyboard: vi.fn(),
}));
type Options = { title?: string; headerLeft?: () => ReactNode; headerRight?: () => ReactNode };
vi.mock("expo-router", () => ({
  usePathname: () => `/projects/project-one/git${state.route === "index" ? "" : "/workspace-diff"}`,
  useLocalSearchParams: () => ({ projectId: "project-one" }),
  useGlobalSearchParams: () => state.commitParams,
  useRouter: () => ({ dismissTo: state.dismissTo }),
  Stack: Object.assign(({ children, screenOptions }: { children: ReactNode; screenOptions: Options }) =>
    <div>{screenOptions.headerRight?.()}{children}</div>, {
      Screen: ({ name, options }: { name: string; options?: Options }) => name === state.route
        ? <div>{options?.title}{options?.headerLeft?.()}</div> : null,
    }),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: state.dismissKeyboard },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pressable: ({ children, onPress, accessibilityLabel }: { children?: ReactNode; onPress: () => void; accessibilityLabel: string }) =>
    <button aria-label={accessibilityLabel} onClick={onPress}>{children}</button>,
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "transparent" }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => <button onClick={onPress}>{children}</button> }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/features/projects/components/project-search-overlay", () => ({ ProjectSearchOverlayProvider: ({ children }: { children: ReactNode }) => <div data-modal-search-host>{children}</div> }));
vi.mock("@/features/projects/components/project-workspace-dock", () => ({ ProjectWorkspaceDock: () => <div data-git-dock /> }));
let root: Root;
let container: HTMLDivElement;
const render = () => act(() => root.render(createElement(GitLayout)));
const click = (label: string) => {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label || item.getAttribute("aria-label") === label);
  expect(button).toBeDefined();
  act(() => button!.click());
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.route = "index"; state.commitParams = {};
  state.dismissTo.mockClear(); state.dismissKeyboard.mockClear();
  container = document.createElement("div"); root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it.each(["index", "workspace-diff"])("dismisses %s and its keyboard to the existing editor", (route) => {
  state.route = route; render(); click("Done");
  expect(state.dismissKeyboard).toHaveBeenCalledOnce();
  expect(state.dismissTo).toHaveBeenCalledExactlyOnceWith({ pathname: "/projects/[projectId]/code", params: { projectId: "project-one" } });
});
it("keeps the Git dock inside its search host and hides it on diffs", () => {
  render();
  expect(container.querySelector('[data-modal-search-host] [data-git-dock]')).not.toBeNull();
  state.route = "workspace-diff"; render();
  expect(container.querySelector('[data-git-dock]')).toBeNull();
  click("Back to Git");
  expect(state.dismissTo).toHaveBeenCalledExactlyOnceWith({ pathname: "/projects/[projectId]/git", params: { projectId: "project-one" } });
});
it.each(["local", "remote"])("shows the %s commit SHA in the modal header", (source) => {
  state.route = "workspace-diff"; state.commitParams = { commitSha: "40d01ac" + "a".repeat(33), source };
  render(); expect(container.textContent).toContain("40d01ac");
  state.commitParams = {}; render(); expect(container.textContent).toContain("Workspace diff");
});
it.each([
  { commitSha: "a".repeat(40) }, { source: "local" },
  { commitSha: ["a".repeat(40)], source: "local" },
  { commitSha: "a".repeat(40), source: "invalid" },
])("keeps the workspace diff title for incomplete parameters: %j", (params) => {
  state.route = "workspace-diff"; state.commitParams = params; render();
  expect(container.textContent).toContain("Workspace diff");
});

vi.mock("@/components/keyboard-symbols-provider", () => ({ KeyboardSymbolsProvider: ({ children }: { children: import("react").ReactNode }) => children }));
