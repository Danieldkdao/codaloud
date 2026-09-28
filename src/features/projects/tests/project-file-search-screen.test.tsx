// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FilesScreen from "@/app/projects/[projectId]/files";
import {
  ProjectWorkspaceFileSearchProvider,
  useProjectWorkspaceFileSearch,
} from "../hooks/use-project-workspace-file-search";
import type { ProjectFileSearchEntrySchema } from "../actions/file-search-schemas";

vi.mock("../hooks/use-project-workspace-branch", () => ({
  useProjectWorkspaceBranch: () => ({ isWorkspaceBusy: false }),
}));

vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => "https://codaloud.test",
}));

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  flushSaves: vi.fn(),
  browse: vi.fn(),
  navigate: vi.fn(),
  push: vi.fn(),
  select: vi.fn(),
}));
vi.mock("../components/project-file-entrance", () => ({
  ProjectFileEntrance: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
const projectId = "abcdef00-0000-4000-8000-000000000001";
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ projectId }),
  useRouter: () => ({ navigate: mocks.navigate, push: mocks.push }),
}));
vi.mock("../actions/file-actions", () => ({
  readProjectFilesAction: mocks.read,
}));
vi.mock("../hooks/use-project-files", () => ({
  useProjectFiles: (...args: unknown[]) => {
    mocks.browse(...args);
    return {
      query: { data: [], isPending: false, isError: false },
      creation: {},
      update: {},
      deletion: {},
    };
  },
}));
vi.mock("../hooks/use-project-workspace-file-creation", () => ({
  useProjectWorkspaceFileCreation: () => ({
    kind: null,
    naming: false,
    beginNaming: vi.fn(),
    endNaming: vi.fn(),
  }),
}));
vi.mock("../hooks/use-project-workspace-current-file", () => ({
  useProjectWorkspaceCurrentFile: () => ({ openFile: mocks.select }),
}));
vi.mock("../hooks/use-project-file-save", () => ({
  useProjectFileSaveRegistry: () => ({ flushPendingSaves: mocks.flushSaves }),
}));
vi.mock("../hooks/use-project-workspace-dock-height", () => ({
  useProjectWorkspaceDockHeight: () => ({ dockHeight: 80 }),
}));
vi.mock("@/hooks/use-success-feedback", () => ({
  useSuccessFeedback: () => vi.fn(),
}));
vi.mock("../components/project-file-create-row", () => ({
  ProjectFileCreateRow: () => null,
}));
vi.mock("../components/project-files-list", () => ({
  ProjectFilesList: ({
    onDirectoryPress,
  }: {
    onDirectoryPress: (path: string) => void;
  }) => (
    <>
      <button onClick={() => onDirectoryPress("src")}>
        Original directory
      </button>
      <button onClick={() => onDirectoryPress("src/components")}>
        Nested directory
      </button>
      <button onClick={() => onDirectoryPress("")}>Workspace root</button>
    </>
  ),
}));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
  HeadingText: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children: ReactNode;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => <div aria-label={accessibilityLabel}>{children}</div>,
  ActivityIndicator: () => <span>Spinner</span>,
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityLabel?: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
  Keyboard: { dismiss: vi.fn() },
  Alert: { alert: vi.fn() },
  FlatList: ({
    data,
    renderItem,
    ListEmptyComponent,
    ListFooterComponent,
    onEndReached,
    onRefresh,
  }: {
    data: ProjectFileSearchEntrySchema[];
    renderItem: (info: { item: ProjectFileSearchEntrySchema }) => ReactNode;
    ListEmptyComponent: ReactNode;
    ListFooterComponent: ReactNode;
    onEndReached: () => void;
    onRefresh: () => void;
  }) => (
    <div>
      {data.length
        ? data.map((item) => <div key={item.path}>{renderItem({ item })}</div>)
        : ListEmptyComponent}
      {ListFooterComponent}
      <button onClick={onEndReached}>List end</button>
      <button onClick={onRefresh}>Pull to refresh</button>
    </div>
  ),
}));

let search: ReturnType<typeof useProjectWorkspaceFileSearch>;
const Controls = () => {
  search = useProjectWorkspaceFileSearch();
  return null;
};
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const cursor = "12345678-1234-4123-8123-123456789abc:10:" + "a".repeat(64);
const page = (path: string, nextCursor: string | null = null) => ({
  files: [
    { path, titleMatches: true, contentMatchCount: 150, contentSearched: true },
  ],
  totalCount: 23,
  nextCursor,
  skippedContentFiles: 0,
  searchedAt: "2026-09-13T00:00:00.000Z",
  expiresAt: "2026-09-13T00:02:00.000Z",
});
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2);
  });
};
const applySearch = async (value: string) => {
  act(() => search.setQuery(value));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await flush();
};
const click = async (label: string) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) =>
      item.getAttribute("aria-label") === label || item.textContent === label,
  );
  expect(button).toBeDefined();
  act(() => button!.click());
  await flush();
};
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.read.mockReset().mockResolvedValue(page("src/live.ts", cursor));
  mocks.flushSaves.mockReset().mockResolvedValue(undefined);
  mocks.browse.mockClear();
  mocks.navigate.mockClear();
  mocks.push.mockClear();
  mocks.select.mockClear();
  client = new QueryClient();
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <ProjectWorkspaceFileSearchProvider>
          <Controls />
          <FilesScreen />
        </ProjectWorkspaceFileSearchProvider>
      </QueryClientProvider>,
    ),
  );
  await flush();
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows pending saves as loading, then surfaces their failure and allows searching after recovery", async () => {
  let failSave!: (reason: Error) => void;
  mocks.flushSaves.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        failSave = reject;
      }),
  );
  await applySearch("live");
  expect(mocks.read).not.toHaveBeenCalled();
  expect(
    container.querySelector('[aria-label="Searching files"]'),
  ).not.toBeNull();
  await act(async () =>
    failSave(new Error("Connection failed. Open Code to retry the save.")),
  );
  await flush();
  expect(container.querySelector('[aria-label="Searching files"]')).toBeNull();
  expect(container.textContent).toContain(
    "Connection failed. Open Code to retry the save.",
  );
  expect(container.textContent).not.toContain("No matching files");
  expect(mocks.read).not.toHaveBeenCalled();
  await click("Try again");
  expect(container.textContent).toContain("live.ts");
  expect(mocks.read).toHaveBeenCalledOnce();
});

it("keeps overlong input editable, shows validation without a spinner, and searches after shortening it", async () => {
  const overlong = "x".repeat(257);
  await applySearch(overlong);
  expect(search.query).toBe(overlong);
  expect(container.textContent).toContain(
    "Shorten your search to 256 characters or fewer.",
  );
  expect(container.querySelector('[aria-label="Searching files"]')).toBeNull();
  expect(container.textContent).not.toContain("No matching files");
  expect(container.textContent).not.toContain("Try again");
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.flushSaves).not.toHaveBeenCalled();
  await applySearch(overlong.slice(0, 256));
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.read.mock.lastCall?.[1].search).toBe(overlong.slice(0, 256));
  expect(container.textContent).not.toContain("Shorten your search");
  expect(container.textContent).toContain("live.ts");
});

it("replaces old results with unsupported-character feedback and returns to browsing when cleared", async () => {
  await applySearch("live");
  expect(container.textContent).toContain("live.ts");
  await applySearch("live\0");
  expect(container.textContent).toContain(
    "Remove unsupported characters from your search.",
  );
  expect(container.textContent).not.toContain("live.ts");
  expect(container.querySelector('[aria-label="Searching files"]')).toBeNull();
  expect(container.textContent).not.toContain("Try again");
  expect(mocks.read).toHaveBeenCalledOnce();
  await applySearch("   ");
  expect(container.textContent).toContain("Original directory");
  expect(container.textContent).not.toContain("Remove unsupported characters");
  expect(mocks.read).toHaveBeenCalledOnce();
});

it("shows the folder without searching, then replaces it with loading and live results", async () => {
  expect(container.textContent).toContain("Original directory");
  expect(mocks.read).not.toHaveBeenCalled();
  await click("Original directory");
  act(() => search.setQuery("live"));
  expect(container.textContent).not.toContain("Original directory");
  expect(
    container.querySelector('[aria-label="Searching files"]'),
  ).not.toBeNull();
  expect(container.textContent).not.toContain("No matching files");
  expect(mocks.read).not.toHaveBeenCalled();
  await applySearch("live");
  expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
    search: "live",
    scope: "all",
    path: "src",
    pageSize: 10,
  });
  expect(container.textContent).toContain("live.ts");
  expect(container.textContent).toContain("23 files");
  expect(container.textContent).toContain("100+ matches found in this file");
  await click("src/live.ts");
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/projects/[projectId]/files/preview",
    params: { projectId, filePath: "src/live.ts", search: "live" },
  });
  act(() => search.setQuery(""));
  expect(container.textContent).toContain("Original directory");
  expect(mocks.browse.mock.lastCall?.[1]).toBe("src");
});

it("hides old results during typing and restarts when filters change", async () => {
  await applySearch("live");
  act(() => search.setQuery("next"));
  expect(container.textContent).not.toContain("live.ts");
  expect(
    container.querySelector('[aria-label="Searching files"]'),
  ).not.toBeNull();
  await applySearch("next");
  act(() => search.setTitle(true));
  await flush();
  expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
    search: "next",
    scope: "title",
    cursor: undefined,
  });
});

it.each([
  {
    title: false,
    content: false,
    currentFolder: false,
    scope: "all",
    path: "src/components",
  },
  {
    title: true,
    content: false,
    currentFolder: false,
    scope: "title",
    path: "",
  },
  {
    title: false,
    content: true,
    currentFolder: false,
    scope: "content",
    path: "",
  },
  { title: true, content: true, currentFolder: false, scope: "all", path: "" },
  {
    title: false,
    content: false,
    currentFolder: true,
    scope: "all",
    path: "src/components",
  },
  {
    title: true,
    content: false,
    currentFolder: true,
    scope: "title",
    path: "src/components",
  },
  {
    title: false,
    content: true,
    currentFolder: true,
    scope: "content",
    path: "src/components",
  },
  {
    title: true,
    content: true,
    currentFolder: true,
    scope: "all",
    path: "src/components",
  },
])(
  "forwards the folder and field filters: $title / $content / $currentFolder",
  async ({ title, content, currentFolder, scope, path }) => {
    await click("Nested directory");
    act(() => {
      search.setTitle(title);
      search.setContent(content);
      search.setCurrentFolder(currentFolder);
    });
    await applySearch("live");
    expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
      search: "live",
      scope,
      path,
      cursor: undefined,
    });
  },
);

it("starts a fresh search when folder scoping changes and keeps that path on subsequent pages", async () => {
  await click("Nested directory");
  act(() => search.setTitle(true));
  await applySearch("live");
  mocks.read.mockResolvedValueOnce(page("root-next.ts"));
  await click("List end");
  expect(mocks.read.mock.lastCall?.[1]).toMatchObject({ path: "", cursor });
  mocks.read.mockResolvedValue(page("src/components/scoped.ts", cursor));
  act(() => search.setCurrentFolder(true));
  await flush();
  expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
    path: "src/components",
    cursor: undefined,
  });
  expect(container.textContent).not.toContain("live.ts");
  mocks.read.mockResolvedValueOnce(page("src/components/scoped-next.ts"));
  await click("List end");
  expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
    path: "src/components",
    cursor,
  });
  act(() => search.setCurrentFolder(false));
  await flush();
  expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
    path: "",
    cursor: undefined,
  });
});

it("follows the browsed directory on later searches and uses an empty path at the workspace root", async () => {
  await click("Nested directory");
  await applySearch("live");
  expect(mocks.read.mock.lastCall?.[1].path).toBe("src/components");
  await applySearch("");
  await click("Original directory");
  await applySearch("live");
  expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
    path: "src",
    cursor: undefined,
  });
  await applySearch("");
  await click("Workspace root");
  act(() => search.setCurrentFolder(true));
  await applySearch("live");
  expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
    path: "",
    cursor: undefined,
  });
});

it.each([
  [false, false],
  [true, false],
  [true, true],
  [false, true],
])(
  "highlights filename matches according to title/content filters (%s, %s)",
  async (title, content) => {
    mocks.read.mockResolvedValue(page("src/Live-live.ts"));
    act(() => {
      search.setTitle(title);
      search.setContent(content);
    });
    await applySearch(" LIVE ");
    const row = container.querySelector('[aria-label="src/Live-live.ts"]')!;
    expect(
      Array.from(
        row.querySelectorAll(".text-primary-foreground"),
        (part) => part.textContent,
      ),
    ).toEqual(content && !title ? [] : ["Live", "live"]);
    expect(row.textContent).toContain("Live-live.ts");
  },
);

it("treats punctuation literally and does not highlight directory-only matches", async () => {
  mocks.read.mockResolvedValue({
    ...page("src/[id].tsx"),
    files: [
      { ...page("src/[id].tsx").files[0] },
      { ...page("[id]/index.tsx").files[0] },
    ],
  });
  await applySearch("[ID]");
  expect(
    Array.from(
      container.querySelectorAll(".text-primary-foreground"),
      (part) => part.textContent,
    ),
  ).toEqual(["[id]"]);
  expect(
    container
      .querySelector('[aria-label="[id]/index.tsx"]')
      ?.querySelector(".text-primary-foreground"),
  ).toBeNull();
});

it("appends pages, guards duplicate requests and retains rows during refresh", async () => {
  await applySearch("live");
  let resolve!: (value: ReturnType<typeof page>) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await click("List end");
  await click("List end");
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(
    container.querySelector('[aria-label="Loading more files"]'),
  ).not.toBeNull();
  expect(container.textContent).toContain("live.ts");
  act(() => resolve(page("src/second.ts")));
  await flush();
  expect(container.textContent).toContain("second.ts");
  await click("List end");
  expect(mocks.read).toHaveBeenCalledTimes(2);
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await click("Pull to refresh");
  expect(mocks.read.mock.lastCall?.[1].cursor).toBeUndefined();
  expect(container.textContent).toContain("live.ts");
  act(() => resolve(page("src/fresh.ts")));
  await flush();
  expect(container.textContent).toContain("fresh.ts");
  expect(container.textContent).not.toContain("second.ts");
});

it("offers retry after initial and next-page failures without claiming no matches", async () => {
  mocks.read.mockResolvedValueOnce(null);
  await applySearch("live");
  expect(container.textContent).not.toContain("No matching files");
  await click("Try again");
  expect(container.textContent).toContain("live.ts");
  mocks.read.mockResolvedValueOnce(null);
  await click("List end");
  expect(container.textContent).toContain("live.ts");
  const attempts = mocks.read.mock.calls.length;
  await click("List end");
  expect(mocks.read).toHaveBeenCalledTimes(attempts);
  mocks.read.mockResolvedValueOnce(page("src/retry.ts"));
  await click("Try again");
  expect(mocks.read.mock.lastCall?.[1].cursor).toBe(cursor);
  expect(container.textContent).toContain("retry.ts");
});

it.each([false, true])(
  "explains search limits and allows recovery with a narrower query (next page: %s)",
  async (nextPage) => {
    if (nextPage) await applySearch("live");
    mocks.read.mockImplementationOnce(
      async (_id, _input, _signal, _restoring, onFailure) => {
        onFailure(413, null, "SEARCH_LIMIT_EXCEEDED");
        return null;
      },
    );
    if (nextPage) await click("List end");
    else await applySearch("live");
    const attempts = mocks.read.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.read).toHaveBeenCalledTimes(attempts);
    expect(container.textContent).toContain(
      "This search is too large. Use a more specific search.",
    );
    expect(container.textContent).not.toContain("No matching files");
    expect(container.textContent).not.toContain("folder");
    expect(container.textContent?.includes("live.ts")).toBe(nextPage);
    expect(container.textContent).toContain("Try again");
    mocks.read.mockResolvedValueOnce(page("src/narrow.ts"));
    await applySearch("more specific text");
    expect(mocks.read.mock.lastCall?.[1]).toMatchObject({
      search: "more specific text",
      cursor: undefined,
    });
    expect(container.textContent).toContain("narrow.ts");
    expect(container.textContent).not.toContain("This search is too large");
  },
);

it("shows the empty state only after a successful empty search", async () => {
  mocks.read.mockResolvedValue({ ...page("unused"), files: [], totalCount: 0 });
  await applySearch("absent");
  expect(container.textContent).toContain("No matching files");
  expect(container.textContent).toContain("0 files");
  expect(container.textContent).not.toContain("could not be searched");
  expect(container.textContent).not.toContain("No matches in searched files");
});

it.each([false, true])(
  "discloses incomplete coverage for empty results (content only: %s)",
  async (contentOnly) => {
    if (contentOnly) act(() => search.setContent(true));
    mocks.read.mockResolvedValueOnce({
      ...page("unused"),
      files: [],
      totalCount: 0,
      skippedContentFiles: 1,
    });
    await applySearch("absent");
    expect(mocks.read.mock.lastCall?.[1].scope).toBe(
      contentOnly ? "content" : "all",
    );
    expect(container.textContent).toContain(
      "Contents of 1 file could not be searched.",
    );
    expect(container.textContent).toContain("No matches in searched files");
    expect(container.textContent).not.toContain("No matching files");
    expect(container.textContent).toContain("0 files");
  },
);

it("counts skipped content once across pages, keeps title matches, and updates coverage on refresh", async () => {
  mocks.read.mockResolvedValueOnce({
    ...page("src/live.ts", cursor),
    files: [
      {
        path: "src/live.ts",
        titleMatches: true,
        contentMatchCount: 0,
        contentSearched: false,
      },
    ],
    skippedContentFiles: 3,
  });
  await applySearch("live");
  expect(container.textContent).toContain("live.ts");
  expect(container.textContent).toContain(
    "Contents of 3 files could not be searched.",
  );
  mocks.read.mockResolvedValueOnce({
    ...page("src/second.ts"),
    skippedContentFiles: 3,
  });
  await click("List end");
  expect(container.textContent).toContain("live.ts");
  expect(container.textContent).toContain("second.ts");
  expect(
    container.textContent?.match(
      /Contents of 3 files could not be searched\./g,
    ),
  ).toHaveLength(1);
  expect(container.textContent).not.toContain("Contents of 6 files");
  mocks.read.mockResolvedValueOnce(page("src/fresh.ts"));
  await click("Pull to refresh");
  expect(container.textContent).toContain("fresh.ts");
  expect(container.textContent).not.toContain("second.ts");
  expect(container.textContent).not.toContain("could not be searched");
});

it("omits content coverage feedback for title-only searches", async () => {
  act(() => search.setTitle(true));
  mocks.read.mockResolvedValueOnce({
    ...page("unused"),
    files: [],
    totalCount: 0,
    skippedContentFiles: 3,
  });
  await applySearch("absent");
  expect(mocks.read.mock.lastCall?.[1].scope).toBe("title");
  expect(container.textContent).toContain("No matching files");
  expect(container.textContent).not.toContain("could not be searched");
  expect(container.textContent).not.toContain("No matches in searched files");
});

it("searches local files while offline", async () => {
  onlineManager.setOnline(false);
  await applySearch("live");
  expect(container.textContent).not.toContain(
    "Reconnect to the internet to continue.",
  );
  expect(container.textContent).not.toContain("No matching files");
  expect(mocks.read).toHaveBeenCalled();
  onlineManager.setOnline(true);
  await flush();
  expect(container.textContent).toContain("live.ts");
});

it("keeps title-only searches out of the preview content highlights", async () => {
  act(() => search.setTitle(true));
  await applySearch("live");
  await click("src/live.ts");
  expect(mocks.push).toHaveBeenLastCalledWith({
    pathname: "/projects/[projectId]/files/preview",
    params: { projectId, filePath: "src/live.ts" },
  });
});
