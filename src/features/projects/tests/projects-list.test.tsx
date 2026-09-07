// @vitest-environment happy-dom
import { act, cloneElement, createElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlatListProps } from "react-native";
import { ProjectsList } from "@/features/projects/components/projects-list";
import type { ProjectResponseData } from "@/features/projects/lib/types";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  listProps: {} as FlatListProps<ProjectResponseData>,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
  useProjects: vi.fn(),
}));
vi.mock("@/features/projects/hooks/use-projects", () => ({ useProjects: mocks.useProjects }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("react-native", () => ({
  View: ({ children, className }: { children?: ReactNode; className?: string }) =>
    createElement("div", { className }, children),
  Pressable: ({ children, href, accessibilityLabel }: { children?: ReactNode; href?: string; accessibilityLabel?: string }) =>
    createElement("a", { href, "aria-label": accessibilityLabel }, children),
  ActivityIndicator: () => createElement("progress"),
  FlatList: (props: FlatListProps<ProjectResponseData>) => {
    mocks.listProps = props;
    return createElement("section", { "data-flat-list": true },
      props.data?.length
        ? Array.from(props.data).map((item, index) => createElement("div", { key: props.keyExtractor?.(item, index) },
          props.renderItem?.({ item, index, separators: { highlight: vi.fn(), unhighlight: vi.fn(), updateProps: vi.fn() } })))
        : props.ListEmptyComponent as ReactNode,
      props.ListFooterComponent as ReactNode);
  },
}));
vi.mock("expo-router", () => ({
  Link: ({ children, href }: { children: ReactElement<{ href?: string }>; href: { params: { projectId: string } } }) =>
    cloneElement(children, { href: `/projects/${encodeURIComponent(href.params.projectId)}` }),
}));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children, accessibilityRole }: { children?: ReactNode; accessibilityRole?: string }) =>
    createElement("span", { role: accessibilityRole }, children);
  return { PText: Text, HeadingText: Text };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, disabled }: { children?: ReactNode; onPress?: () => void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, children),
}));

const project = (id: string, setupStatus: ProjectResponseData["setupStatus"] = "ready"): ProjectResponseData => ({
  id, userId: "owner", name: `Project ${id}`, sandboxId: "sandbox", setupStatus,
  setupError: null, githubRepositoryId: null, lastOpenedFilePath: null, lastOpenedAt: null,
  createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-07T12:00:00.000Z",
});
let root: Root;
let container: HTMLDivElement;
const render = () => act(() => root.render(createElement(ProjectsList)));
const reachEnd = () => act(() => mocks.listProps.onEndReached?.({ distanceFromEnd: 0 }));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  mocks.fetchNextPage.mockResolvedValue({});
  mocks.refetch.mockResolvedValue({});
  mocks.query = {
    data: { pages: [[project("one")]], pageParams: [1] },
    isPending: false, isFetching: false, isRefetching: false, isFetchingNextPage: false,
    isFetchNextPageError: false, error: null, fetchStatus: "idle", hasNextPage: true,
    fetchNextPage: mocks.fetchNextPage, refetch: mocks.refetch,
  };
  mocks.useProjects.mockImplementation(() => mocks.query);
});
afterEach(() => act(() => root.unmount()));

describe("ProjectsList", () => {
  it("renders linked projects from every page and deduplicates overlapping pages", () => {
    mocks.query.data = { pages: [[project("one")], [project("one"), project("two")]] };
    render();
    expect(container.querySelectorAll("a")).toHaveLength(2);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/projects/one");
    expect(container.textContent).toContain("Project two");
    expect(container.textContent).toContain("Updated");
    expect(mocks.listProps.keyExtractor?.(project("one"), 0)).toBe("one");
  });

  it.each([
    ["pending", "Queued"], ["running", "Setting up"], ["ready", "Ready"], ["failed", "Setup failed"],
  ] as const)("shows the correct label for %s projects", (status, label) => {
    mocks.query.data = { pages: [[{ ...project("one", status), githubRepositoryId: "123" }]] };
    render();
    expect(container.textContent).toContain(label);
    expect(container.textContent).toContain("GitHub import");
  });

  it("loads the next page at the end", () => {
    render();
    reachEnd();
    expect(mocks.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  });

  it.each([
    { isFetching: true }, { hasNextPage: false }, { error: new Error("Failed") }, { fetchStatus: "paused" },
  ])("does not load more when unavailable: %j", (state) => {
    Object.assign(mocks.query, state);
    render();
    reachEnd();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });

  it("distinguishes initial loading, empty results, and offline state", () => {
    Object.assign(mocks.query, { data: undefined, isPending: true, fetchStatus: "fetching" });
    render();
    expect(container.textContent).toContain("Loading projects");
    expect(container.textContent).not.toContain("No projects yet");
    Object.assign(mocks.query, { data: { pages: [[]] }, isPending: false, fetchStatus: "idle" });
    render();
    expect(container.textContent).toContain("No projects yet");
    mocks.query.fetchStatus = "paused";
    render();
    expect(container.textContent).toContain("Waiting for a connection");
  });

  it("retries a failed continuation without hiding existing projects", () => {
    Object.assign(mocks.query, { error: new Error("Unable to load projects."), isFetchNextPageError: true });
    render();
    expect(container.textContent).toContain("Project one");
    act(() => container.querySelector("button")?.click());
    expect(mocks.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it("retries initial failures and supports pull to refresh", () => {
    Object.assign(mocks.query, { data: undefined, error: new Error("Unable to load projects.") });
    render();
    act(() => container.querySelector("button")?.click());
    expect(mocks.refetch).toHaveBeenCalledOnce();
    mocks.query.error = null;
    render();
    act(() => mocks.listProps.onRefresh?.());
    expect(mocks.refetch).toHaveBeenCalledTimes(2);
  });

  it("shows a footer spinner while another page loads", () => {
    Object.assign(mocks.query, { isFetching: true, isFetchingNextPage: true });
    render();
    expect(container.textContent).toContain("Loading more projects");
    expect(container.textContent).toContain("Project one");
    expect(mocks.listProps.refreshing).toBe(false);
  });
});
