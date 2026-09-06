import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/components/ui/text", () => ({ PText: "span" }));
vi.mock("@/components/ui/icon", () => ({ Icon: "i" }));
vi.mock("@/components/ui/input", () => ({ Input: "input" }));
vi.mock("@/components/ui/radio-item", () => ({ RadioItem: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", null, children),
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ source: mocks.source }) }));
vi.mock("@/features/accounts/hooks/use-github-connected", () => ({
  useGitHubConnected: () => ({ isConnected: mocks.connected, isChecking: mocks.checking, isPending: false, handleConnect: vi.fn() }),
}));

import { GitHubRepositoriesList } from "@/services/github/components/github-repositories-list";
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

const renderList = () => renderToStaticMarkup(createElement(GitHubRepositoriesList));

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
    const html = renderToStaticMarkup(createElement(GitHubRepositoriesList, { className: "max-h-96" }));
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
