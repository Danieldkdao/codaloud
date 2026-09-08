// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateProjectForm } from "@/features/projects/components/create-project-form";
import { projectParamsSchema } from "@/features/projects/lib/project-params";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  replace: vi.fn(),
  alert: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/components/success-feedback-provider", () => ({ useSuccessFeedback: () => mocks.success }));
vi.mock("@/features/projects/actions/actions", () => ({
  createProjectAction: mocks.createProject,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useLocalSearchParams: () => ({ name: "New project" }),
}));
vi.mock("@/lib/utils", () => ({ alert: mocks.alert }));
vi.mock("@/services/github/hooks/use-github-connected", () => ({
  useGitHubConnected: () => ({ isConnected: false }),
}));
vi.mock("@/services/github/components/github-repositories-select-list", () => ({
  GitHubRepositoriesSelectList: () => null,
}));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("react-native", () => {
  const View = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
  return { View, ScrollView: View };
});
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("@/components/ui/input", () => ({ Input: () => null }));
vi.mock("@/components/ui/radio-item", () => ({ RadioItem: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    onPress: () => void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, children),
}));

const activeKey = [
  "projects",
  "infinite",
  "cursor",
  "user-one",
  projectParamsSchema.parse({}),
];
const filteredKey = [
  "projects",
  "infinite",
  "cursor",
  "user-one",
  projectParamsSchema.parse({ search: "other" }),
];
const repositoryKey = ["github", "repositories"];
const oldPage = {
  pages: [{ projects: [], nextCursor: null }],
  pageParams: [null],
};
const newPage = {
  pages: [
    {
      projects: [{ id: "new-project", name: "New project" }],
      nextCursor: null,
    },
  ],
  pageParams: [null],
};
let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
let unsubscribe: () => void;
const loadProjects = vi.fn();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(activeKey, oldPage);
  client.setQueryData(filteredKey, oldPage);
  client.setQueryData(repositoryKey, []);
  loadProjects.mockReset().mockResolvedValue(newPage);
  const observer = new QueryObserver(client, {
    queryKey: activeKey,
    queryFn: loadProjects,
  });
  unsubscribe = observer.subscribe(() => {});
  mocks.createProject.mockResolvedValue({
    error: false,
    message: "Created",
    projectId: "new-project",
  });
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(CreateProjectForm),
      ),
    );
  });
});
afterEach(() => {
  act(() => root.unmount());
  unsubscribe();
  client.clear();
});
const submit = async () => {
  await act(async () => {
    container.querySelector("button")!.click();
  });
};

describe("project creation cache updates", () => {
  it("refreshes the mounted project list and invalidates inactive filters on success", async () => {
    await submit();
    expect(mocks.createProject).toHaveBeenCalledWith({
      name: "New project",
      source: "new",
    });
    expect(loadProjects).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Project created");
    expect(client.getQueryData(activeKey)).toEqual(newPage);
    expect(client.getQueryState(filteredKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(repositoryKey)?.isInvalidated).toBe(false);
    expect(mocks.replace).toHaveBeenCalledWith({
      pathname: "/projects/[projectId]",
      params: { projectId: "new-project" },
    });
  });

  it("preserves the cache and stays on the form when creation fails", async () => {
    mocks.createProject.mockResolvedValue({
      error: true,
      message: "Creation failed",
    });
    await submit();
    expect(loadProjects).not.toHaveBeenCalled();
    expect(client.getQueryData(activeKey)).toEqual(oldPage);
    expect(client.getQueryState(filteredKey)?.isInvalidated).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledWith("Error: Creation failed");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("navigates after creation even while the list refresh is pending", async () => {
    loadProjects.mockImplementation(() => new Promise(() => {}));
    await submit();
    expect(loadProjects).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Project created");
  });
});
