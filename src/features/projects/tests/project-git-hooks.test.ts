// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useProjectGit } from "../hooks/use-project-git";

const { session, actions } = vi.hoisted(() => ({
  session: { data: { user: { id: "user-one" } } as { user: { id: string } } | null, isPending: false, error: null as Error | null },
  actions: {
    readProjectGitCountsAction: vi.fn(), fetchProjectGitAction: vi.fn(), pushProjectGitAction: vi.fn(), pullProjectGitAction: vi.fn(),
    createProjectBranchAction: vi.fn(), checkoutProjectBranchAction: vi.fn(), readProjectBranchesAction: vi.fn(),
    readProjectCommitsAction: vi.fn(), createProjectCommitAction: vi.fn(), revertProjectCommitAction: vi.fn(), undoProjectCommitAction: vi.fn(),
    readProjectChangesAction: vi.fn(), readProjectDiscardPreviewAction: vi.fn(), discardProjectChangesAction: vi.fn(),
    readProjectStashesAction: vi.fn(), stashProjectChangesAction: vi.fn(), popProjectStashAction: vi.fn(),
  },
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));
vi.mock("../actions/git-actions", () => actions);

const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
const counts = { currentBranch: "main", headSha: "a".repeat(40), upstream: null, upstreamSha: null, outgoing: null, incoming: null, isShallow: false, observedAt: "2026-09-15T12:00:00Z" };
let client: QueryClient;
let root: Root;
let readHook: () => void;
const Probe = () => { readHook(); return null; };
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const renderHook = async <T,>(useHook: () => T) => {
  let current!: T;
  readHook = () => { current = useHook(); };
  const rerender = async () => {
    await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(Probe))); });
    await flush();
  };
  await rerender();
  return { get current() { return current; }, rerender };
};
const run = async <T,>(operation: () => Promise<T>) => {
  let result!: T;
  await act(async () => { result = await operation(); });
  await flush();
  return result;
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  onlineManager.setOnline(true);
  session.data = { user: { id: "user-one" } };
  session.error = null;
  session.isPending = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  root = createRoot(document.createElement("div"));
  actions.readProjectGitCountsAction.mockResolvedValue(counts);
  actions.readProjectStashesAction.mockResolvedValue({ stashes: [], nextCursor: null, patch: null });
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

type MutationResult<V> = {
  mutateAsync: (input: V) => Promise<unknown>;
  mutate: unknown;
  reset: unknown;
  isPending: boolean;
  error: Error | null;
};
const verifyMutation = <V,>({ name, useResult, action, input, noInput = false }: {
  name: string;
  useResult: (id: string | null) => MutationResult<V>;
  action: Mock;
  input: V;
  noInput?: boolean;
}) => {
  describe(name, () => {
    beforeEach(() => action.mockResolvedValue({ error: false, message: "Completed.", data: { completed: true } }));
    it("exports the whole mutation and refreshes files, changes and commit details", async () => {
      const keys = ["file", "files", "changes", "git-counts", "commit-details"].map((kind) => ["projects", kind, "user-one", projectId]);
      keys.forEach((key) => client.setQueryData(key, { before: true }));
      const hook = await renderHook(() => useResult(projectId));
      expect(hook.current.mutate).toEqual(expect.any(Function));
      expect(hook.current.reset).toEqual(expect.any(Function));
      expect(await run(() => hook.current.mutateAsync(input))).toEqual({ completed: true });
      expect(action).toHaveBeenCalledExactlyOnceWith(...(noInput ? [projectId] : [projectId, input]));
      keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    });
    it.each(["pending", "signed-out", "error", "invalid-project"])("blocks invalid requests: %s", async (state) => {
      if (state === "pending") session.isPending = true;
      if (state === "signed-out") session.data = null;
      if (state === "error") session.error = new Error("session");
      const hook = await renderHook(() => useResult(state === "invalid-project" ? "../other" : projectId));
      await run(async () => { await expect(hook.current.mutateAsync(input)).rejects.toThrow(); });
      expect(action).not.toHaveBeenCalled();
    });
    it("preserves failures, refreshes uncertain outcomes, and never retries writes", async () => {
      const key = ["projects", "changes", "user-one", projectId];
      client.setQueryData(key, { before: true });
      action.mockResolvedValue({ error: true, code: "GIT_OUTCOME_UNKNOWN", message: "Refresh the workspace." });
      const hook = await renderHook(() => useResult(projectId));
      await run(async () => { await expect(hook.current.mutateAsync(input)).rejects.toMatchObject({ code: "GIT_OUTCOME_UNKNOWN", message: "Refresh the workspace." }); });
      expect(action).toHaveBeenCalledOnce();
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(hook.current.error).toMatchObject({ code: "GIT_OUTCOME_UNKNOWN" });
    });
    it("refreshes the submitted account and project after navigation", async () => {
      let finish!: (value: unknown) => void;
      action.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
      let id = projectId;
      const original = ["projects", "changes", "user-one", id];
      const other = ["projects", "changes", "user-two", otherProjectId];
      [original, other].forEach((key) => client.setQueryData(key, { before: true }));
      const hook = await renderHook(() => useResult(id));
      let pending!: Promise<unknown>;
      await act(async () => { pending = hook.current.mutateAsync(input); });
      id = otherProjectId;
      session.data = { user: { id: "user-two" } };
      await hook.rerender();
      await run(async () => { finish({ error: false, message: "Done.", data: {} }); await pending; });
      expect(client.getQueryState(original)?.isInvalidated).toBe(true);
      expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    });
    it("does not queue an offline write for a later workspace state", async () => {
      onlineManager.setOnline(false);
      action.mockResolvedValue({ error: true, code: "GIT_REQUEST_FAILED", message: "Offline." });
      const hook = await renderHook(() => useResult(projectId));
      await run(async () => { await expect(hook.current.mutateAsync(input)).rejects.toThrow("Offline."); });
      onlineManager.setOnline(true);
      await flush();
      expect(action).toHaveBeenCalledOnce();
    });
  });
};

describe("Git counts", () => {
  it("loads user-scoped counts and forwards cancellation", async () => {
    const hook = await renderHook(() => useProjectGit(projectId));
    expect(hook.current.data).toEqual(counts);
    expect(actions.readProjectGitCountsAction).toHaveBeenCalledWith(projectId, expect.any(AbortSignal), expect.any(Function));
    expect(client.getQueryData(["projects", "git-counts", "user-one", projectId])).toEqual(counts);
  });
  it.each(["disabled", "pending", "signed-out", "error", "invalid-project"])("does not automatically load counts when %s", async (state) => {
    if (state === "pending") session.isPending = true;
    if (state === "signed-out") session.data = null;
    if (state === "error") session.error = new Error("session");
    const hook = await renderHook(() => useProjectGit(state === "invalid-project" ? "invalid" : projectId, { enabled: state !== "disabled" }));
    expect(actions.readProjectGitCountsAction).not.toHaveBeenCalled();
    if (state !== "disabled") {
      await run(async () => { await expect(hook.current.refetch({ throwOnError: true })).rejects.toThrow(); });
      expect(actions.readProjectGitCountsAction).not.toHaveBeenCalled();
    }
  });
  it("surfaces null responses without retrying unclassified failures", async () => {
    actions.readProjectGitCountsAction.mockResolvedValue(null);
    const hook = await renderHook(() => useProjectGit(projectId));
    expect(hook.current.error).toBeInstanceOf(Error);
    expect(actions.readProjectGitCountsAction).toHaveBeenCalledOnce();
  });
});
