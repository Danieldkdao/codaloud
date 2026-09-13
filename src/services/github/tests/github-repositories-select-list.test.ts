// @vitest-environment happy-dom

import { act, createElement, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

vi.mock("@/hooks/use-success-feedback", () => ({ useSuccessFeedback: () => mocks.success }));

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  listProps: {} as Record<string, any>,
  connected: false,
  checking: false,
  source: "github",
  loadMore: vi.fn(),
  retry: vi.fn(),
  createProject: vi.fn(),
  success: vi.fn(),
  alert: vi.fn(),
  replace: vi.fn(),
  handleConnect: vi.fn(),
  invalidateQueries: vi.fn(),
  reconnectPending: false,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/features/projects/actions/actions", () => ({
  createProjectAction: mocks.createProject,
}));
vi.mock("@/services/github/hooks/use-github-repositories", () => ({
  useGitHubRepositories: () => mocks.query,
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: Parameters<typeof clsx>) => twMerge(clsx(...values)),
  alert: mocks.alert,
}));
vi.mock("react-native", () => ({
  View: "div",
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    accessibilityState,
    className,
  }: any) =>
    createElement(
      "button",
      {
        type: "button",
        onClick: onPress,
        "aria-label": accessibilityLabel,
        "aria-pressed": accessibilityState?.selected,
        className,
      },
      children,
    ),
  ScrollView: ({ children }: any) =>
    createElement("section", { "data-native-scroll-view": true }, children),
  useWindowDimensions: () => ({ width: 390, height: 700 }),
  KeyboardAvoidingView: ({ children }: any) =>
    createElement("div", null, children),
  ActivityIndicator: "progress",
  Platform: { select: (options: { default: string }) => options.default },
  FlatList: (props: any) => {
    mocks.listProps = props;
    const children = createElement(
      "div",
      null,
      props.ListHeaderComponent,
      props.data.length
        ? props.data.map((item: any) =>
            createElement("div", { key: item.id }, props.renderItem({ item })),
          )
        : props.ListEmptyComponent,
      props.ListFooterComponent,
    );
    return createElement(
      "section",
      { className: props.className, "data-native-flat-list": true },
      props.renderScrollComponent
        ? props.renderScrollComponent({ children })
        : children,
    );
  },
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({
    children,
    className,
    accessibilityLiveRegion,
    accessibilityRole,
  }: any) =>
    createElement(
      "span",
      {
        className,
        "aria-live": accessibilityLiveRegion,
        role: accessibilityRole,
      },
      children,
    ),
}));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name, className, accessibilityLabel }: any) =>
    createElement("i", { name, className, "aria-label": accessibilityLabel }),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChangeText, placeholder, className }: any) =>
    createElement("input", {
      value,
      placeholder,
      className,
      onChange: (event: { target: { value: string } }) =>
        onChangeText?.(event.target.value),
    }),
}));
vi.mock("@/components/ui/radio-item", () => ({
  RadioItem: ({ title, value, onValueChange }: any) =>
    createElement("button", { onClick: () => onValueChange(value) }, title),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
    loading,
  }: {
    children: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) =>
    createElement(
      "button",
      { onClick: onPress, disabled, "aria-busy": loading },
      children,
    ),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ source: mocks.source, name: "My project" }),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "theme-color" }));
vi.mock("react-native-svg", () => {
  const Node = ({ children }: { children?: ReactNode }) => createElement("span", null, children);
  return { default: Node, Defs: Node, LinearGradient: Node, Stop: Node, Rect: Node };
});
vi.mock("@/services/github/hooks/use-github-connected", () => ({
  useGitHubConnected: () => ({
    isConnected: mocks.connected,
    isChecking: mocks.checking,
    isPending: mocks.reconnectPending,
    handleConnect: mocks.handleConnect,
  }),
}));

import { GitHubRepositoriesSelectList } from "@/services/github/components/github-repositories-select-list";
import { CreateProjectForm } from "@/features/projects/components/create-project-form";
import NewProjectScreen from "@/app/new-project";

beforeEach(() => {
  mocks.connected = false;
  mocks.reconnectPending = false;
  mocks.checking = false;
  mocks.source = "github";
  mocks.listProps = {};
  mocks.createProject.mockReset();
  mocks.createProject.mockResolvedValue({
    error: true,
    message: "Please try again.",
  });
  mocks.query = {
    data: {
      pages: [
        {
          repositories: [
            {
              id: 1,
              fullName: "owner/private-repo",
              description: "A repository description",
              private: true,
              defaultBranch: "main",
            },
          ],
          nextCursor: "second",
        },
        {
          repositories: [
            {
              id: 2,
              fullName: "owner/public-repo",
              description: null,
              private: false,
              defaultBranch: "develop",
            },
          ],
          nextCursor: "third",
        },
      ],
    },
    isPending: false,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage: true,
    loadMore: mocks.loadMore,
    retry: mocks.retry,
  };
});

const SelectListHarness = ({ className }: { className?: string }) => {
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<
    string | null
  >(null);
  return createElement(GitHubRepositoriesSelectList, {
    className,
    selectedRepositoryId,
    onValueChange: (repository) => setSelectedRepositoryId(repository ? String(repository.id) : null),
  });
};

const renderList = () => renderToStaticMarkup(createElement(SelectListHarness));

describe("new-project screen scrolling", () => {
  it("keeps the virtualized repository list outside plain scroll views", () => {
    mocks.connected = true;
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(NewProjectScreen));
    const list = container.querySelector("[data-native-flat-list]");
    expect(list).not.toBeNull();
    expect(list!.closest("[data-native-scroll-view]")).toBeNull();
    expect(
      container.querySelectorAll("[data-native-scroll-view]"),
    ).toHaveLength(1);
    expect(list!.textContent).not.toContain("Project name");
    expect(list!.textContent).toContain("owner/private-repo");
    expect(list!.textContent).not.toContain("Create project");
  });

  it.each([
    ["new", false],
    ["github", false],
  ])(
    "keeps the form scrollable without a repository list for source=%s, connected=%s",
    (source, connected) => {
      Object.assign(mocks, { source, connected });
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(
        createElement(NewProjectScreen),
      );
      expect(
        container.querySelector("[data-native-scroll-view]")?.textContent,
      ).toContain("Project name");
      const submit = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Create project",
      )!;
      expect(submit.closest("[data-native-scroll-view]")).toBeNull();
      expect(container.querySelector("[data-native-flat-list]")).toBeNull();
    },
  );

  it("keeps the form fields mounted and stops pagination when a repository is selected", () => {
    mocks.connected = true;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    root = createRoot(container);
    act(() => root!.render(createElement(NewProjectScreen)));
    const nameInput = container.querySelector(
      'input[placeholder="My project"]',
    );
    const repositoryButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("owner/private-repo"))!;
    act(() => repositoryButton.click());
    expect(container.querySelector('input[placeholder="My project"]')).toBe(
      nameInput,
    );
    expect((nameInput as HTMLInputElement).value).toBe("My project");
    expect(container.textContent).toContain("Create project");
    expect(
      container.querySelector('[placeholder="Search repositories"]'),
    ).toBeNull();
    expect(container.querySelector("[data-native-flat-list]")).toBeNull();
    expect(mocks.loadMore).not.toHaveBeenCalled();
  });

  it.each([20, 500])(
    "keeps submission outside the bounded picker with %s repositories",
    (count) => {
      mocks.connected = true;
      mocks.query.data = {
        pages: [
          {
            repositories: Array.from({ length: count }, (_, index) => ({
              id: index + 1,
              fullName: `owner/repo-${index}`,
              description: null,
              private: false,
            })),
            nextCursor: "more",
          },
        ],
      };
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(
        createElement(NewProjectScreen),
      );
      const submit = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Create project",
      )!;
      expect(submit.closest("[data-native-flat-list]")).toBeNull();
      expect(submit.closest("[data-native-scroll-view]")).toBeNull();
      expect(
        container
          .querySelector("[data-native-flat-list]")
          ?.closest(".max-h-80"),
      ).not.toBeNull();
      expect(mocks.listProps.data).toHaveLength(count);
    },
  );
});

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
    expect(html.indexOf('placeholder="Search repositories"')).toBeLessThan(
      html.indexOf("owner/private-repo"),
    );
  });

  it("loads another page on reaching the end", () => {
    renderList();
    mocks.listProps.onEndReached();
    expect(mocks.loadMore).toHaveBeenCalledOnce();
  });

  it("shows initial loading and empty states", () => {
    Object.assign(mocks.query, { data: undefined, isPending: true });
    expect(renderList()).toContain("Loading repositories");
    Object.assign(mocks.query, {
      data: { pages: [{ repositories: [], nextCursor: null }] },
      isPending: false,
      hasNextPage: false,
    });
    expect(renderList()).toContain("No repositories found");
  });

  it("keeps loaded repositories visible when a later page fails", () => {
    Object.assign(mocks.query, {
      error: new Error("Unable to load more repositories."),
      isFetchNextPageError: true,
    });
    const html = renderList();
    expect(html).toContain("owner/private-repo");
    expect(html).toContain("Unable to load more repositories.");
    expect(html).toContain("Try again");
  });

  it("allows the default maximum height to be overridden", () => {
    const html = renderToStaticMarkup(
      createElement(SelectListHarness, { className: "max-h-96" }),
    );
    expect(html).toContain("max-h-96");
    expect(html).not.toContain("max-h-80");
  });

  it.each([
    ["github", true, false, true],
    ["github", false, false, false],
    ["github", true, true, false],
    ["new", true, false, false],
  ])(
    "gates repositories for source=%s, connected=%s, checking=%s",
    (source, connected, checking, visible) => {
      Object.assign(mocks, { source, connected, checking });
      const html = renderToStaticMarkup(createElement(CreateProjectForm));
      expect(html.includes("owner/private-repo")).toBe(visible);
    },
  );
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
  ])(
    "collapses around repository %s and reopens when pressed again",
    (id, name, otherName) => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const container = document.createElement("div");
      root = createRoot(container);
      Object.assign(mocks.query, {
        error: new Error("Unable to load more repositories."),
        isFetchNextPageError: true,
      });
      act(() =>
        root!.render(
          createElement(SelectListHarness, { className: "max-h-96" }),
        ),
      );

      const pressRepository = (repositoryName: string) => {
        const button = Array.from(container.querySelectorAll("button")).find(
          (button) => button.textContent?.includes(repositoryName),
        );
        expect(button).toBeDefined();
        act(() => button!.click());
      };

      expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
      pressRepository(name);

      expect(
        container.querySelector('[aria-pressed="true"]')?.textContent,
      ).toContain(name);
      expect(container.textContent).toContain(name);
      expect(container.textContent).not.toContain(otherName);
      expect(
        container.querySelector('input[placeholder="Search repositories"]'),
      ).toBeNull();
      expect(container.textContent).not.toContain("Try again");
      expect(container.querySelector('[aria-pressed="true"]')).not.toBeNull();
      expect(container.querySelector(".min-h-24")).toBeNull();

      pressRepository(name);

      expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
      expect(container.textContent).toContain(otherName);
      expect(
        container.querySelector('input[placeholder="Search repositories"]'),
      ).not.toBeNull();
      expect(container.textContent).toContain("Try again");
      expect(container.querySelector(".max-h-96")).not.toBeNull();
      expect(container.querySelector('[aria-pressed="true"]')).toBeNull();

      pressRepository(otherName);
      expect(container.textContent).not.toContain(name);
      expect(
        container.querySelector('[aria-pressed="true"]')?.textContent,
      ).toContain(otherName);
    },
  );
});

describe("project form repository validation", () => {
  const mountForm = () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    root = createRoot(container);
    act(() => root!.render(createElement(CreateProjectForm)));
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
    const submitted = mocks.createProject;
    const container = mountForm();
    await press(container, "Create project");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Select a GitHub repository.",
    );
    expect(submitted).not.toHaveBeenCalled();

    await press(container, "owner/private-repo");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await press(container, "Create project");
    expect(submitted).toHaveBeenLastCalledWith({
      name: "My project",
      source: "github",
      repositoryId: "1",
    });

    await press(container, "owner/private-repo");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Select a GitHub repository.",
    );
    await press(container, "Create project");
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("removes the selection and its error when switching to a new project", async () => {
    mocks.connected = true;
    const submitted = mocks.createProject;
    const container = mountForm();
    await press(container, "owner/private-repo");
    await press(container, "New project");
    await press(container, "Create project");
    expect(submitted).toHaveBeenLastCalledWith({
      name: "My project",
      source: "new",
    });

    await press(container, "Import from GitHub");
    await press(container, "Create project");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Select a GitHub repository.",
    );
    await press(container, "New project");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await press(container, "Create project");
    expect(submitted).toHaveBeenCalledTimes(2);
  });

  it("shows the repository error even when GitHub is disconnected", async () => {
    const container = mountForm();
    await press(container, "Create project");
    expect(container.textContent).toContain("Click here to connect");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Select a GitHub repository.",
    );
  });

  it("disables submission while creating, redirects, and shows success feedback", async () => {
    mocks.source = "new";
    let resolveCreation!: (result: {
      error: false;
      message: string;
      projectId: string;
    }) => void;
    mocks.createProject.mockReturnValue(
      new Promise((resolve) => {
        resolveCreation = resolve;
      }),
    );
    const container = mountForm();
    await press(container, "Create project");
    const button = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Create project",
    )!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await press(container, "Create project");
    expect(mocks.createProject).toHaveBeenCalledExactlyOnceWith({
      name: "My project",
      source: "new",
    });
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () =>
      resolveCreation({
        error: false,
        message: "Project created successfully.",
        projectId: "new-project-id",
      }),
    );
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Project created");
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith({
      pathname: "/projects/[projectId]",
      params: { projectId: "new-project-id" },
    });
    expect(mocks.replace.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.success.mock.invocationCallOrder[0],
    );
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("shows an error without navigating and allows a retry", async () => {
    mocks.source = "new";
    const container = mountForm();
    await press(container, "Create project");
    expect(mocks.alert).toHaveBeenCalledWith("Error: Please try again.");
    expect(mocks.replace).not.toHaveBeenCalled();
    const button = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Create project",
    )!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
    await press(container, "Create project");
    expect(mocks.createProject).toHaveBeenCalledTimes(2);
  });
});

describe("project form GitHub reconnection", () => {
  const mount = () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    root = createRoot(container);
    act(() => root!.render(createElement(CreateProjectForm)));
    return container;
  };

  it.each([false, true])(
    "offers reconnection for a rejected token even with cached repositories (later page: %s)",
    async (laterPage) => {
      mocks.connected = true;
      Object.assign(mocks.query, {
        error: Object.assign(
          new Error("Reconnect GitHub to access your repositories."),
          { status: 403, code: "GITHUB_RECONNECT_REQUIRED" },
        ),
        isFetchNextPageError: laterPage,
      });
      const container = mount();
      const reconnect = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Reconnect GitHub",
      );
      expect(reconnect).toBeDefined();
      expect(container.textContent).not.toContain("Try again");
      await act(async () => reconnect!.click());
      expect(mocks.handleConnect).toHaveBeenCalledOnce();
      expect(mocks.retry).not.toHaveBeenCalled();
    },
  );

  it("still shows reconnection when a previously selected repository loses access", async () => {
    mocks.connected = true;
    const container = mount();
    await act(async () =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("owner/private-repo"))!
        .click(),
    );
    Object.assign(mocks.query, {
      error: Object.assign(new Error("Reconnect GitHub"), {
        code: "GITHUB_RECONNECT_REQUIRED",
        status: 403,
      }),
    });
    act(() => root!.render(createElement(CreateProjectForm)));
    const reconnect = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Reconnect GitHub",
    );
    expect(reconnect).toBeDefined();
    await act(async () => reconnect!.click());
    expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(mocks.handleConnect).toHaveBeenCalledOnce();
  });

  it.each([403, 429, 502])(
    "keeps ordinary retry for non-authentication error %s",
    (status) => {
      mocks.connected = true;
      Object.assign(mocks.query, {
        error: Object.assign(new Error("Request failed"), { status }),
      });
      const container = mount();
      expect(container.textContent).toContain("Try again");
      expect(container.textContent).not.toContain("Reconnect GitHub");
    },
  );

  it("disables reconnect while authorization is in progress", () => {
    mocks.connected = true;
    mocks.reconnectPending = true;
    Object.assign(mocks.query, {
      error: Object.assign(new Error("Reconnect GitHub"), {
        code: "GITHUB_RECONNECT_REQUIRED",
      }),
    });
    const container = mount();
    const reconnect = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Reconnect GitHub",
    );
    expect(reconnect?.disabled).toBe(true);
  });
});

it("refreshes repository authorization when the import itself requires reconnection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.connected = true;
  mocks.createProject.mockResolvedValue({
    error: true,
    code: "GITHUB_RECONNECT_REQUIRED",
    message: "Reconnect GitHub",
  });
  const container = document.createElement("div");
  root = createRoot(container);
  act(() => root!.render(createElement(CreateProjectForm)));
  await act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("owner/private-repo"))!
      .click(),
  );
  await act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Create project")!
      .click(),
  );
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["github", "repositories"],
  });
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("offers a manual continuation when an empty search batch has more pages", () => {
  Object.assign(mocks.query, {
    data: { pages: [{ repositories: [], nextCursor: "more" }] },
    hasNextPage: true,
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  act(() => root!.render(createElement(SelectListHarness)));
  expect(container.textContent).not.toContain("No repositories found");
  const more = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Continue searching",
  );
  expect(more).toBeDefined();
  act(() => more!.click());
  expect(mocks.loadMore).toHaveBeenCalledOnce();
});

it("deduplicates repositories if GitHub's sort order shifts between pages", () => {
  const data = mocks.query.data as {
    pages: { repositories: { id: number }[]; nextCursor: string }[];
  };
  data.pages[1].repositories.unshift(data.pages[0].repositories[0]);
  renderList();
  expect(
    mocks.listProps.data.map((repository: { id: number }) => repository.id),
  ).toEqual([1, 2]);
});

it("removes the load-more control only when the cursor is exhausted", () => {
  expect(renderList()).toContain("Load more repositories");
  Object.assign(mocks.query, { hasNextPage: false });
  expect(renderList()).not.toContain("Load more repositories");
});
