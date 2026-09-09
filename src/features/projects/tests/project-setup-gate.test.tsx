// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ProjectSetupGate } from "@/features/projects/components/project-setup-gate";

const state = vi.hoisted(() => ({
  query: {
    data: undefined as { name: string; setupStatus: string; sandboxId: string | null } | undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  renderWorkspace: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ projectId: "project-one" }),
  Stack: { Screen: () => null },
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 60, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "transparent" }));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) => createElement("p", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children?: ReactNode; onPress: () => void }) => createElement("button", { onClick: onPress }, children),
}));
vi.mock("@/features/projects/hooks/use-project", () => ({ useProject: () => state.query }));
vi.mock("@/features/projects/components/project-sandbox-state", () => ({
  ProjectSandboxState: () => createElement("p", null, "Scaffolding your sandbox"),
}));
vi.mock("@/features/projects/components/sandbox-scaffold", () => ({ SandboxScaffold: () => null }));

const Workspace = () => {
  state.renderWorkspace();
  return createElement("p", null, "Requested workspace route");
};
let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(createElement(ProjectSetupGate, null, createElement(Workspace))));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  Object.assign(state.query, { data: undefined, isError: false, isFetching: false });
});
afterEach(() => act(() => root.unmount()));

it("does not mount a requested child route before the project loads", () => {
  render();
  expect(container.textContent).toContain("Opening your sandbox");
  expect(state.renderWorkspace).not.toHaveBeenCalled();
});

it.each(["pending", "running", "failed"])("blocks workspace routes while setup is %s, even with a sandbox ID", (setupStatus) => {
  state.query.data = { name: "Example", setupStatus, sandboxId: "sandbox-one" };
  render();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain(setupStatus === "failed" ? "Sandbox setup couldn’t finish" : "Scaffolding your sandbox");
});

it("opens the requested child when setup becomes ready and removes it if readiness is lost", () => {
  state.query.data = { name: "Example", setupStatus: "running", sandboxId: "sandbox-one" };
  render();
  state.query.data = { ...state.query.data, setupStatus: "ready" };
  render();
  expect(container.textContent).toBe("Requested workspace route");
  state.query.data = { ...state.query.data, setupStatus: "pending" };
  render();
  expect(container.textContent).not.toContain("Requested workspace route");
});

it("blocks a stale ready result on a query error and offers a retry", () => {
  state.query.data = { name: "Example", setupStatus: "ready", sandboxId: "sandbox-one" };
  state.query.isError = true;
  render();
  expect(state.renderWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Unable to load your sandbox");
  act(() => container.querySelector("button")?.click());
  expect(state.query.refetch).toHaveBeenCalledOnce();
});
