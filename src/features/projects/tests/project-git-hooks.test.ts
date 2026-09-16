// @vitest-environment happy-dom
import { useProjectCommitHistory } from "../hooks/use-project-commit-history";
import { useProjectBranches } from "../hooks/use-project-branches";
import { useProjectChanges } from "../hooks/use-project-changes";
import { useProjectStashes } from "../hooks/use-project-stashes";
import { ProjectGitRequestError } from "../lib/git-errors";
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
const verifyMutation = <V,>({ name, useResult, action, input, noInput = false, unknownCode = "GIT_OUTCOME_UNKNOWN" }: {
  name: string;
  useResult: (id: string | null) => MutationResult<V>;
  action: Mock;
  input: V;
  noInput?: boolean;
  unknownCode?: string;
}) => {
  describe(name, () => {
    beforeEach(() => { action.mockResolvedValue({ error: false, message: "Completed.", data: { completed: true } }); });
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
      action.mockResolvedValue({ error: true, code: unknownCode, message: "Refresh the workspace." });
      const hook = await renderHook(() => useResult(projectId));
      await run(async () => { await expect(hook.current.mutateAsync(input)).rejects.toMatchObject({ code: unknownCode, message: "Refresh the workspace." }); });
      expect(action).toHaveBeenCalledOnce();
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(hook.current.error).toMatchObject({ code: unknownCode });
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

verifyMutation({
  name: "fetch",
  useResult: (id) => useProjectGit(id, { enabled: false }).fetch,
  action: actions.fetchProjectGitAction,
  input: undefined,
  noInput: true,
});

verifyMutation({
  name: "push",
  useResult: (id) => useProjectGit(id, { enabled: false }).push,
  action: actions.pushProjectGitAction,
  input: { force: true, expectedRemoteSha: "a".repeat(40) },
});

verifyMutation({
  name: "pull",
  useResult: (id) => useProjectGit(id, { enabled: false }).pull,
  action: actions.pullProjectGitAction,
  input: { rebase: true },
});

verifyMutation({
  name: "createBranch",
  useResult: (id) => useProjectBranches(id, { enabled: false }).createBranch,
  action: actions.createProjectBranchAction,
  input: { branchName: "feature/mobile" },
});

verifyMutation({
  name: "revert",
  useResult: (id) => useProjectCommitHistory(id, { enabled: false }).revert,
  action: actions.revertProjectCommitAction,
  input: { mainline: 1 },
});

verifyMutation({
  name: "undo",
  useResult: (id) => useProjectCommitHistory(id, { enabled: false }).undo,
  action: actions.undoProjectCommitAction,
  input: { mode: "mixed" },
});

describe("discard preview", () => {
  it("stays disabled until requested and exports the complete query", async () => {
    const hook = await renderHook(() => useProjectChanges(projectId, { enabled: false }));
    expect(actions.readProjectDiscardPreviewAction).not.toHaveBeenCalled();
    expect(hook.current.discardPreview.data).toBeUndefined();
    const preview = { currentBranch: "main", headSha: "a".repeat(40), fingerprint: "b".repeat(64), changedPaths: [] };
    actions.readProjectDiscardPreviewAction.mockResolvedValue(preview);
    await run(() => hook.current.discardPreview.refetch({ throwOnError: true }));
    expect(hook.current.discardPreview.data).toEqual(preview);
    expect(actions.readProjectDiscardPreviewAction).toHaveBeenCalledWith(projectId, expect.any(AbortSignal), expect.any(Function));
  });
  it("guards manual preview reads against invalid sessions", async () => {
    session.data = null;
    const hook = await renderHook(() => useProjectChanges(projectId, { enabled: false }));
    await run(async () => { await expect(hook.current.discardPreview.refetch({ throwOnError: true })).rejects.toThrow(); });
    expect(actions.readProjectDiscardPreviewAction).not.toHaveBeenCalled();
  });
});

verifyMutation({
  name: "discardChanges",
  useResult: (id) => useProjectChanges(id, { enabled: false }).discardChanges,
  action: actions.discardProjectChangesAction,
  input: { fingerprint: "a".repeat(64), confirm: true, includeUntracked: true },
});

describe("stash list", () => {
  it("normalizes search, paginates, and keeps successful empty pages", async () => {
    actions.readProjectStashesAction.mockResolvedValueOnce({ stashes: [], patch: null, nextCursor: "next" })
      .mockResolvedValue({ stashes: [], patch: null, nextCursor: null });
    const hook = await renderHook(() => useProjectStashes(projectId, { search: " WORK ", pageSize: 5 }));
    expect(hook.current.data?.pages).toHaveLength(1);
    expect(hook.current.hasNextPage).toBe(true);
    await run(async () => { await hook.current.loadMore(); });
    expect(hook.current.data?.pages).toHaveLength(2);
    expect(hook.current.hasNextPage).toBe(false);
    expect(actions.readProjectStashesAction.mock.calls.map(([, input]) => input)).toEqual([
      { search: "work", pageSize: 5, cursor: undefined }, { search: "work", pageSize: 5, cursor: "next" },
    ]);
  });
  it.each(["disabled", "signed-out", "invalid-project", "invalid-page-size", "invalid-page-limit"])("guards stash reads when %s", async (state) => {
    if (state === "signed-out") session.data = null;
    const hook = await renderHook(() => useProjectStashes(state === "invalid-project" ? "invalid" : projectId, {
      enabled: state !== "disabled", pageSize: state === "invalid-page-size" ? 0 : 20,
      maxPages: state === "invalid-page-limit" ? -1 : 0,
    }));
    expect(actions.readProjectStashesAction).not.toHaveBeenCalled();
    expect(hook.current.loadMore()).toBeUndefined();
    if (state !== "disabled") await run(async () => { await expect(hook.current.refetch({ throwOnError: true })).rejects.toThrow(); });
    expect(actions.readProjectStashesAction).not.toHaveBeenCalled();
  });
  it.each(["INVALID_STASH_CURSOR", "GIT_STASH_CHANGED"])("restarts expired %s pagination after first-page eviction", async (code) => {
    actions.readProjectStashesAction.mockResolvedValueOnce({ stashes: [], patch: null, nextCursor: "next" })
      .mockResolvedValueOnce({ stashes: [], patch: null, nextCursor: "last" })
      .mockImplementationOnce(async (_id, _input, _signal, onFailure) => { onFailure(409, null, code); return null; })
      .mockResolvedValue({ stashes: [], patch: null, nextCursor: null });
    const hook = await renderHook(() => useProjectStashes(projectId, { maxPages: 1 }));
    await run(async () => { await hook.current.loadMore(); });
    await run(async () => { await hook.current.loadMore(); });
    expect(hook.current.error).toMatchObject({ code });
    await run(async () => { await hook.current.retry(); });
    expect(actions.readProjectStashesAction.mock.calls.map(([, input]) => input.cursor)).toEqual([undefined, "next", "last", undefined]);
    expect(hook.current.data?.pageParams).toEqual([undefined]);
  });
});

describe("stash details", () => {
  it("loads the selected stash by index and SHA with a separate cache key", async () => {
    const stashSha = "a".repeat(40);
    const details = { stashes: [{ index: 0, sha: stashSha, message: "work", createdAt: "2026-09-15T12:00:00Z" }], nextCursor: null, patch: "diff --git" };
    actions.readProjectStashesAction.mockResolvedValue(details);
    const hook = await renderHook(() => useProjectStashes(projectId, { enabled: false, stashIndex: 0, stashSha }));
    expect(hook.current.stashDetails.data).toBeUndefined();
    await run(() => hook.current.stashDetails.refetch({ throwOnError: true }));
    expect(hook.current.stashDetails.data).toEqual(details);
    expect(actions.readProjectStashesAction).toHaveBeenCalledExactlyOnceWith(projectId,
      { index: 0, stashSha, search: "", pageSize: 20 }, expect.any(AbortSignal), expect.any(Function));
    expect(client.getQueryData(["projects", "stash-details", "user-one", projectId, 0, stashSha])).toEqual(details);
  });
  it("never requests an unidentified stash, even through manual refetch", async () => {
    const hook = await renderHook(() => useProjectStashes(projectId, { enabled: false }));
    await run(async () => { await expect(hook.current.stashDetails.refetch({ throwOnError: true })).rejects.toThrow(); });
    expect(actions.readProjectStashesAction).not.toHaveBeenCalled();
  });
});

verifyMutation({
  name: "stash",
  useResult: (id) => useProjectStashes(id, { enabled: false }).stash,
  action: actions.stashProjectChangesAction,
  input: { message: "save work" },
});

verifyMutation({
  name: "popStash",
  useResult: (id) => useProjectStashes(id, { enabled: false }).popStash,
  action: actions.popProjectStashAction,
  input: { stashIndex: 0, stashSha: "a".repeat(40), restoreIndex: true },
});

verifyMutation({
  name: "checkout",
  useResult: (id) => useProjectBranches(id, { enabled: false }).checkout,
  action: actions.checkoutProjectBranchAction,
  input: { branchName: "feature/mobile" },
  unknownCode: "CHECKOUT_OUTCOME_UNKNOWN",
});

verifyMutation({
  name: "commit",
  useResult: (id) => useProjectCommitHistory(id, { enabled: false }).commit,
  action: actions.createProjectCommitAction,
  input: { message: "save", paths: ["file.ts"] },
  unknownCode: "COMMIT_OUTCOME_UNKNOWN",
});

const verifyReadRetries = (name: string, useRead: () => { refetch: (options: { throwOnError: boolean }) => Promise<unknown> }, action: Mock, resource: string) => {
  it(`${name} retries only transient failures and preserves server failure metadata`, async () => {
    action.mockImplementation(async (...args) => {
      args.at(-1)(409, null, "STALE_SELECTION");
      return null;
    });
    const hook = await renderHook(useRead);
    await run(async () => { await expect(hook.current.refetch({ throwOnError: true })).rejects.toMatchObject({ status: 409, code: "STALE_SELECTION" }); });
    const options = client.getQueryCache().getAll().find((query) => query.queryKey[1] === resource)!.options;
    const shouldRetry = options.retry;
    const delay = options.retryDelay;
    expect(typeof shouldRetry).toBe("function");
    expect(typeof delay).toBe("function");
    if (typeof shouldRetry !== "function" || typeof delay !== "function") throw new Error("Expected retry functions.");
    expect(shouldRetry(0, new Error("invalid response"))).toBe(false);
    expect(shouldRetry(0, new ProjectGitRequestError(409, null, "STALE_SELECTION"))).toBe(false);
    expect(shouldRetry(0, new ProjectGitRequestError(0, null))).toBe(true);
    expect(shouldRetry(1, new ProjectGitRequestError(502, null))).toBe(true);
    expect(shouldRetry(2, new ProjectGitRequestError(502, null))).toBe(false);
    expect(shouldRetry(20, new ProjectGitRequestError(503, "3", "WORKSPACE_RESTORING"))).toBe(true);
    expect(delay(0, new ProjectGitRequestError(503, "3", "WORKSPACE_RESTORING"))).toBe(3000);
    expect(delay(8, new ProjectGitRequestError(502, null))).toBe(30_000);
    expect(action).toHaveBeenCalledOnce();
  });
};

verifyReadRetries("counts", () => useProjectGit(projectId, { enabled: false }), actions.readProjectGitCountsAction, "git-counts");
verifyReadRetries("discard preview", () => useProjectChanges(projectId, { enabled: false }).discardPreview, actions.readProjectDiscardPreviewAction, "discard-preview");
verifyReadRetries("stash list", () => useProjectStashes(projectId, { enabled: false }), actions.readProjectStashesAction, "stashes");
verifyReadRetries("stash details", () => useProjectStashes(projectId, { enabled: false, stashIndex: 0, stashSha: "a".repeat(40) }).stashDetails, actions.readProjectStashesAction, "stash-details");
