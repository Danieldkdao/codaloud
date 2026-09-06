// @vitest-environment happy-dom

import { act, createElement, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  listProps: {} as Record<string, any>,
  connected: false,
  checking: false,
  source: "github",
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/services/github/hooks/use-github-repositories", () => ({
  useGitHubRepositories: () => mocks.query,
}));
vi.mock("@/lib/utils", () => ({ cn: (...values: Parameters<typeof clsx>) => twMerge(clsx(...values)) }));
vi.mock("react-native", () => ({
  View: "div",
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState, className }: any) =>
    createElement("button", {
      type: "button",
      onClick: onPress,
      "aria-label": accessibilityLabel,
      "aria-pressed": accessibilityState?.selected,
      className,
    }, children),
  ScrollView: "section",
  ActivityIndicator: "progress",
  Platform: { select: (options: { default: string }) => options.default },
  FlatList: (props: any) => {
    mocks.listProps = props;
    return createElement("section", { className: props.className },
      props.data.length ? props.data.map((item: any) => createElement("div", { key: item.id }, props.renderItem({ item }))) : props.ListEmptyComponent,
      props.ListFooterComponent,
    );
  },
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children, className, accessibilityLiveRegion, accessibilityRole }: any) =>
    createElement("span", { className, "aria-live": accessibilityLiveRegion, role: accessibilityRole }, children),
}));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name, className, accessibilityLabel }: any) =>
    createElement("i", { name, className, "aria-label": accessibilityLabel }),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChangeText, placeholder, className }: any) =>
    createElement("input", {
      value, placeholder, className,
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    }),
}));
vi.mock("@/components/ui/radio-item", () => ({
  RadioItem: ({ title, value, onValueChange }: any) =>
    createElement("button", { onClick: () => onValueChange(value) }, title),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) =>
    createElement("button", { onClick: onPress }, children),
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ source: mocks.source, name: "My project" }) }));
vi.mock("@/features/accounts/hooks/use-github-connected", () => ({
  useGitHubConnected: () => ({ isConnected: mocks.connected, isChecking: mocks.checking, isPending: false, handleConnect: vi.fn() }),
}));

import { GitHubRepositoriesSelectList } from "@/services/github/components/github-repositories-select-list";
import { ProjectForm } from "@/features/projects/components/project-form";

beforeEach(() => {
  mocks.connected = false;
  mocks.checking = false;
  mocks.source = "github";
  mocks.listProps = {};
  mocks.query = {
    data: { pages: [[{ id: 1, fullName: "owner/private-repo", description: "A repository description", private: true }], [{ id: 2, fullName: "owner/public-repo", description: null, private: false }]] },
    isPending: false, isFetching: false, isFetchingNextPage: false,
    isFetchNextPageError: false, error: null, hasNextPage: true,
    fetchNextPage: mocks.fetchNextPage, refetch: mocks.refetch,
  };
});

const SelectListHarness = ({ className }: { className?: string }) => {
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  return createElement(GitHubRepositoriesSelectList, {
    className, selectedRepositoryId, onValueChange: setSelectedRepositoryId,
  });
};

const renderList = () => renderToStaticMarkup(createElement(SelectListHarness));

describe("GitHub repositories list", () => {
  it("renders repositories from every loaded page with visibility and optional descriptions", () => {
    const html = renderList();
    expect(html).toContain("owner/private-repo");
    expect(html).toContain("owner/public-repo");
    expect(html).toContain("Private");
    expect(html).toContain("Public");
    expect(html).toContain("A repository description");
    expect(html).toContain('name="lock"');
    expect(html).toContain('name="globe"');
    expect(mocks.listProps.data).toHaveLength(2);
    expect(mocks.listProps.keyExtractor({ id: 2 })).toBe("2");
  });

  it("renders a search field above the repositories", () => {
    const html = renderList();
    expect(html).toContain('placeholder="Search repositories"');
    expect(html.indexOf('placeholder="Search repositories"')).toBeLessThan(html.indexOf("owner/private-repo"));
  });

  it("loads another page on reaching the end", () => {
    renderList();
    mocks.listProps.onEndReached();
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });

  it.each([{ isFetching: true }, { hasNextPage: false }, { error: new Error("Failed") }])("does not automatically load more when blocked by %o", (state) => {
    Object.assign(mocks.query, state);
    renderList();
    mocks.listProps.onEndReached();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });

  it("shows initial loading and empty states", () => {
    Object.assign(mocks.query, { data: undefined, isPending: true });
    expect(renderList()).toContain("Loading repositories");
    Object.assign(mocks.query, { data: { pages: [[]] }, isPending: false, hasNextPage: false });
    expect(renderList()).toContain("No repositories found");
  });

  it("keeps loaded repositories visible when a later page fails", () => {
    Object.assign(mocks.query, { error: new Error("Unable to load more repositories."), isFetchNextPageError: true });
    const html = renderList();
    expect(html).toContain("owner/private-repo");
    expect(html).toContain("Unable to load more repositories.");
    expect(html).toContain("Try again");
  });

  it("allows the default maximum height to be overridden", () => {
    const html = renderToStaticMarkup(createElement(SelectListHarness, { className: "max-h-96" }));
    expect(html).toContain("max-h-96");
    expect(html).not.toContain("max-h-80");
  });

  it.each([
    ["github", true, false, true],
    ["github", false, false, false],
    ["github", true, true, false],
    ["new", true, false, false],
  ])("gates repositories for source=%s, connected=%s, checking=%s", (source, connected, checking, visible) => {
    Object.assign(mocks, { source, connected, checking });
    const html = renderToStaticMarkup(createElement(ProjectForm));
    expect(html.includes("owner/private-repo")).toBe(visible);
  });
});

let root: Root | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
});

describe("repository selection", () => {
  it.each([
    ["1", "owner/private-repo", "owner/public-repo"],
    ["2", "owner/public-repo", "owner/private-repo"],
  ])("collapses around repository %s and reopens when pressed again", (id, name, otherName) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    root = createRoot(container);
    Object.assign(mocks.query, {
      error: new Error("Unable to load more repositories."),
      isFetchNextPageError: true,
    });
    act(() => root!.render(createElement(SelectListHarness, { className: "max-h-96" })));

    const pressRepository = (repositoryName: string) => {
      const button = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.includes(repositoryName),
      );
      expect(button).toBeDefined();
      act(() => button!.click());
    };

    expect(container.textContent).toContain("Selected repository ID: null");
    pressRepository(name);

    expect(container.textContent).toContain(`Selected repository ID: ${id}`);
    expect(container.textContent).toContain(name);
    expect(container.textContent).not.toContain(otherName);
    expect(container.querySelector('input[placeholder="Search repositories"]')).toBeNull();
    expect(container.textContent).not.toContain("Try again");
    expect(container.querySelector('[aria-pressed="true"]')).not.toBeNull();
    expect(container.querySelector(".min-h-24")).toBeNull();

    pressRepository(name);

    expect(container.textContent).toContain("Selected repository ID: null");
    expect(container.textContent).toContain(otherName);
    expect(container.querySelector('input[placeholder="Search repositories"]')).not.toBeNull();
    expect(container.textContent).toContain("Try again");
    expect(container.querySelector(".max-h-96")).not.toBeNull();
    expect(container.querySelector('[aria-pressed="true"]')).toBeNull();

    pressRepository(otherName);
    expect(container.textContent).not.toContain(name);
    expect(container.textContent).toContain(`Selected repository ID: ${id === "1" ? "2" : "1"}`);
  });
});

describe("project form repository validation", () => {
  const mountForm = () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    root = createRoot(container);
    act(() => root!.render(createElement(ProjectForm)));
    return container;
  };

  const press = async (container: HTMLElement, text: string) => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes(text),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  it("requires a selection, clears the error after selecting, and validates clearing it", async () => {
    mocks.connected = true;
    const submitted = vi.spyOn(console, "log").mockImplementation(() => {});
    const container = mountForm();
    await press(container, "Create project");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Select a GitHub repository.");
    expect(submitted).not.toHaveBeenCalled();

    await press(container, "owner/private-repo");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await press(container, "Create project");
    expect(submitted).toHaveBeenLastCalledWith({ name: "My project", source: "github", repositoryId: "1" });

    await press(container, "owner/private-repo");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Select a GitHub repository.");
    await press(container, "Create project");
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("removes the selection and its error when switching to a new project", async () => {
    mocks.connected = true;
    const submitted = vi.spyOn(console, "log").mockImplementation(() => {});
    const container = mountForm();
    await press(container, "owner/private-repo");
    await press(container, "New project");
    await press(container, "Create project");
    expect(submitted).toHaveBeenLastCalledWith({ name: "My project", source: "new" });

    await press(container, "Import from GitHub");
    await press(container, "Create project");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Select a GitHub repository.");
    await press(container, "New project");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await press(container, "Create project");
    expect(submitted).toHaveBeenCalledTimes(2);
  });

  it("shows the repository error even when GitHub is disconnected", async () => {
    const container = mountForm();
    await press(container, "Create project");
    expect(container.textContent).toContain("Click here to connect");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Select a GitHub repository.");
  });
});
