// @vitest-environment happy-dom
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import EditProjectScreen from "@/app/edit-project";

const state = vi.hoisted(() => ({
  projectId: undefined as string | string[] | undefined,
  query: {
    data: undefined as { id: string; name: string; userId: string } | undefined,
    isPending: true,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  useProject: vi.fn(),
  formProps: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ projectId: state.projectId }),
  useRouter: () => ({ back: vi.fn() }),
  Stack: { Screen: () => null },
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  KeyboardAvoidingView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  ActivityIndicator: () => createElement("div", { role: "progressbar" }),
  Platform: { OS: "ios" },
  useWindowDimensions: () => ({ height: 800 }),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
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
vi.mock("@/features/projects/hooks/use-project", () => ({
  useProject: (id: string) => { state.useProject(id); return state.query; },
}));
vi.mock("@/features/projects/components/update-project-form", () => ({
  UpdateProjectForm: ({ projectId, defaultValues }: { projectId: string; defaultValues: { name?: string } }) => {
    state.formProps({ projectId, defaultValues });
    const [initialName] = useState(defaultValues.name);
    return createElement("input", { defaultValue: initialName });
  },
}));

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(createElement(EditProjectScreen)));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  state.projectId = "project-one";
  Object.assign(state.query, { data: undefined, isPending: true, isError: false, isFetching: false });
});
afterEach(() => act(() => root.unmount()));

it.each([undefined, "", "   ", ["project-one", "project-two"]])("renders nothing without a single project ID (%s)", (id) => {
  state.projectId = id;
  render();
  expect(container.innerHTML).toBe("");
  expect(state.useProject).not.toHaveBeenCalled();
});

it("loads the requested project before showing the form", () => {
  render();
  expect(state.useProject).toHaveBeenCalledWith("project-one");
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(state.formProps).not.toHaveBeenCalled();
  state.query.data = { id: "project-one", name: "My project", userId: "user-one" };
  state.query.isPending = false;
  render();
  expect(container.querySelector("input")?.value).toBe("My project");
  expect(state.formProps).toHaveBeenLastCalledWith({ projectId: "project-one", defaultValues: { name: "My project" } });
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
});

it("offers a retry when the project cannot be loaded", () => {
  Object.assign(state.query, { isPending: false, isError: true });
  render();
  expect(state.formProps).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Unable to load project");
  act(() => container.querySelector("button")?.click());
  expect(state.query.refetch).toHaveBeenCalledOnce();
});

it("preserves the form during refetches but resets it when the project ID changes", () => {
  Object.assign(state.query, { isPending: false, data: { id: "project-one", name: "First", userId: "user-one" } });
  render();
  state.query.data = { ...state.query.data!, name: "Refetched" };
  state.query.isFetching = true;
  render();
  expect(container.querySelector("input")?.value).toBe("First");
  state.projectId = "project-two";
  state.query.data = { ...state.query.data, id: "project-two", name: "Second" };
  render();
  expect(container.querySelector("input")?.value).toBe("Second");
});
