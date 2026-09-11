// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import { GitHubRepositoryBranchesList } from "@/services/github/components/github-repository-branches-list";
import type { GitHubRepositoryBranch } from "@/services/github/types";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  useBranches: vi.fn(),
  loadMore: vi.fn(),
  retry: vi.fn(),
  listProps: {} as Record<string, any>,
  changeSearch: (_value: string) => {},
}));
vi.mock("@/services/github/hooks/use-github-repository-branches", () => ({
  useGitHubRepositoryBranches: mocks.useBranches,
}));
vi.mock("@/lib/utils", () => ({ cn: (...values: Parameters<typeof clsx>) => twMerge(clsx(...values)) }));
vi.mock("react-native", () => ({
  View: ({ children, className, accessibilityLabel }: any) => createElement("div", { className, "aria-label": accessibilityLabel }, children),
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState }: any) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-pressed": accessibilityState?.selected }, children),
  ActivityIndicator: () => createElement("progress"),
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children, accessibilityRole }: any) => createElement("span", { role: accessibilityRole }, children),
}));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name, accessibilityLabel }: any) => createElement("i", { "data-icon": name, "aria-label": accessibilityLabel }),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChangeText, placeholder }: any) => {
    mocks.changeSearch = onChangeText;
    return createElement("input", { value, placeholder, readOnly: true });
  },
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, disabled, loading }: any) => createElement("button", { onClick: onPress, disabled, "aria-busy": loading }, children),
}));
vi.mock("@/components/ui/scroll-fade-flat-list", () => ({
  ScrollFadeFlatList: (props: any) => {
    mocks.listProps = props;
    return createElement("section", { "aria-label": props.accessibilityLabel },
      props.data.length ? props.data.map((item: GitHubRepositoryBranch) => createElement("div", { key: props.keyExtractor(item) }, props.renderItem({ item }))) : props.ListEmptyComponent,
      props.ListFooterComponent,
    );
  },
}));

const branch = (name: string, protectedBranch = false): GitHubRepositoryBranch => ({
  name, protected: protectedBranch, commitSha: "abcdef0123456789abcdef0123456789abcdef0123",
});
let root: Root;
let container: HTMLDivElement;
const Harness = ({ repositoryId, initialBranch = null }: { repositoryId: string; initialBranch?: string | null }) => {
  const [selectedBranchName, onValueChange] = useState<string | null>(initialBranch);
  return createElement(GitHubRepositoryBranchesList, { repositoryId, selectedBranchName, onValueChange });
};
const render = async (repositoryId = "123", initialBranch: string | null = null) => {
  await act(async () => root.render(createElement(Harness, { key: repositoryId, repositoryId, initialBranch })));
};
const press = async (label: string) => {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.query = {
    data: { pages: [{ branches: [branch("main", true)], nextCursor: "next" }, { branches: [branch("main", true), branch("feature/one")], nextCursor: "more" }] },
    isPending: false, isFetching: false, isFetchingNextPage: false,
    isFetchNextPageError: false, fetchStatus: "idle", error: null, hasNextPage: true,
    loadMore: mocks.loadMore, retry: mocks.retry,
  };
  mocks.useBranches.mockImplementation(() => mocks.query);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("GitHub repository branch browsing", () => {
  it("renders unique branches across pages with commit hashes and protection indicators", async () => {
    await render();
    expect(mocks.useBranches).toHaveBeenLastCalledWith("123", { search: "" });
    expect(mocks.listProps.data.map(({ name }: GitHubRepositoryBranch) => name)).toEqual(["main", "feature/one"]);
    expect(mocks.listProps.keyExtractor(branch("main"))).toBe("main");
    expect(container.textContent).toContain("abcdef0");
    expect(container.querySelectorAll('[data-icon="git-branch"]')).toHaveLength(2);
    expect(container.querySelectorAll('[aria-label="Protected branch"]')).toHaveLength(1);
    expect(container.querySelector('[data-icon="globe"]')).toBeNull();
    expect(container.querySelector('input[placeholder="Search branches"]')).not.toBeNull();
    expect(mocks.listProps.keyboardShouldPersistTaps).toBe("handled");
    expect(container.querySelector('.max-h-64')).not.toBeNull();
  });

  it("collapses around the selected branch and reopens on another press", async () => {
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="main"]')!.click());
    expect(container.querySelector('input[placeholder="Search branches"]')).toBeNull();
    expect(container.querySelector('section[aria-label="GitHub repository branches"]')).toBeNull();
    expect(container.querySelector('[aria-label="main"]')?.getAttribute('aria-pressed')).toBe("true");
    expect(container.textContent).not.toContain("feature/one");
    expect(container.querySelector('.shrink-0')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="main"]')!.click());
    expect(container.querySelector('input[placeholder="Search branches"]')).not.toBeNull();
    expect(container.textContent).toContain("feature/one");
  });

  it("collapses immediately with unknown metadata, then enriches the row when details arrive", async () => {
    Object.assign(mocks.query, { data: undefined, isPending: true });
    await render("123", "release/default");
    expect(container.querySelector('[aria-label="release/default"]')?.getAttribute('aria-pressed')).toBe("true");
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain("Unknown");
    expect(container.querySelector('[data-icon="git-commit"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Protected branch"]')).toBeNull();
    Object.assign(mocks.query, { data: { pages: [{ branches: [branch("main")], nextCursor: "more" }] }, isPending: false });
    await render();
    expect(container.textContent).toContain("Unknown");
    expect(mocks.loadMore).not.toHaveBeenCalled();
    Object.assign(mocks.query, { data: { pages: [{ branches: [branch("release/default", true)], nextCursor: null }] } });
    await render();
    expect(container.textContent).toContain("abcdef0");
    expect(container.textContent).not.toContain("Unknown");
    expect(container.querySelector('[aria-label="Protected branch"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="release/default"]')!.click());
    await render();
    expect(container.querySelector('input[placeholder="Search branches"]')).not.toBeNull();
  });

  it("debounces typing by 250ms before searching", async () => {
    vi.useFakeTimers();
    await render();
    await act(async () => mocks.changeSearch("feat"));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await act(async () => mocks.changeSearch("feature"));
    await act(async () => vi.advanceTimersByTimeAsync(249));
    expect(mocks.useBranches).toHaveBeenLastCalledWith("123", { search: "" });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mocks.useBranches).toHaveBeenLastCalledWith("123", { search: "feature" });
  });

  it("resets search and cancels pending input when the selected repository changes", async () => {
    vi.useFakeTimers();
    await render();
    await act(async () => mocks.changeSearch("old search"));
    await render("456");
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(mocks.useBranches).toHaveBeenLastCalledWith("456", { search: "" });
    expect(container.querySelector("input")?.value).toBe("");
  });

  it("loads more at the end and offers a manual fallback", async () => {
    await render();
    await act(async () => mocks.listProps.onEndReached());
    expect(mocks.loadMore).toHaveBeenCalledOnce();
    await press("Load more branches");
    expect(mocks.loadMore).toHaveBeenCalledTimes(2);
  });

  it("shows loading and empty states", async () => {
    Object.assign(mocks.query, { data: undefined, isPending: true, hasNextPage: false });
    await render();
    expect(container.textContent).toContain("Loading branches…");
    expect(container.querySelector("progress")).not.toBeNull();
    Object.assign(mocks.query, { data: { pages: [{ branches: [], nextCursor: null }] }, isPending: false });
    await render();
    expect(container.textContent).toContain("No branches found.");
  });

  it("distinguishes an exhausted search from an empty page with continuation", async () => {
    vi.useFakeTimers();
    Object.assign(mocks.query, { data: { pages: [{ branches: [], nextCursor: null }] }, hasNextPage: false });
    await render();
    await act(async () => mocks.changeSearch("missing"));
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(container.textContent).toContain("No matching branches found.");
    Object.assign(mocks.query, { hasNextPage: true });
    await render();
    await press("Continue searching");
    expect(mocks.loadMore).toHaveBeenCalledOnce();
  });

  it.each([false, true])("calls the hook retry for next-page error=%s", async (isFetchNextPageError) => {
    Object.assign(mocks.query, { error: new Error("Unable to load branches."), isFetchNextPageError });
    await render();
    expect(container.textContent).toContain("feature/one");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load branches.");
    await press("Try again");
    expect(mocks.retry).toHaveBeenCalledOnce();
    expect(mocks.loadMore).not.toHaveBeenCalled();
  });

  it("shows offline and next-page loading states", async () => {
    Object.assign(mocks.query, { fetchStatus: "paused" });
    await render();
    expect(container.textContent).toContain("Waiting for a connection…");
    Object.assign(mocks.query, { fetchStatus: "fetching", isFetchingNextPage: true, isFetching: true });
    await render();
    expect(container.textContent).toContain("Loading more branches…");
  });
});
