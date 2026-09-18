// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readProjectChangesAction } from "../actions/git-actions";
import type { ProjectRepositoryChangesSchema } from "../actions/change-schemas";
import { useProjectChanges } from "../hooks/use-project-changes";
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("../actions/git-actions", () => ({ readProjectChangesAction: vi.fn() }));

const read = vi.mocked(readProjectChangesAction);
const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
const snapshot: ProjectRepositoryChangesSchema = {
  repositoryState: "ready", currentBranch: "main", headSha: "a".repeat(40),
  isDetached: false, observedAt: "2026-09-13T12:00:00Z", changes: [],
};
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjectChanges>;
const Probe = ({ id, enabled }: { id: string | null | undefined; enabled: boolean }) => {
  current = { ...useProjectChanges(id, { enabled }) };
  return null;
};
const tick = async (milliseconds = 1) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
};
const render = async (id: string | null | undefined = projectId, enabled = true) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { id, enabled })));
  });
  await tick();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: 3 } } });
  root = createRoot(document.createElement("div"));
  read.mockReset().mockResolvedValue(snapshot);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("returns the ordinary query result and preserves empty changes", async () => {
  await render();
  expect(current.isSuccess).toBe(true);
  expect(current.data).toEqual(snapshot);
  expect(current.data).not.toHaveProperty("pages");
  expect(read).toHaveBeenCalledExactlyOnceWith(projectId, expect.any(AbortSignal));
  expect(client.getQueryData(["projects", "changes", projectId])).toEqual(snapshot);
});

it("does not poll while focused or in the background", async () => {
  await render();
  await tick(30_000);
  expect(read).toHaveBeenCalledOnce();
  act(() => focusManager.setFocused(false));
  await tick(30_000);
  expect(read).toHaveBeenCalledOnce();
});

it("keeps the prior snapshot while a manual refresh is pending", async () => {
  await render();
  let finish!: (value: ProjectRepositoryChangesSchema) => void;
  read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  act(() => { void current.refetch(); });
  await tick();
  expect(current.isFetching).toBe(true);
  expect(current.isPending).toBe(false);
  expect(current.data).toEqual(snapshot);
  await act(async () => { finish({ ...snapshot, currentBranch: "updated" }); });
  await tick();
  expect(current.data?.currentBranch).toBe("updated");
});

it("drains saves then cancels an initial obsolete read before refreshing", async () => {
  let finishOld!: (value: ProjectRepositoryChangesSchema) => void;
  let finishSave!: () => void;
  read.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
  await render();
  const oldSignal = read.mock.calls[0][1]!;
  const flushSaves = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
  let refresh!: Promise<unknown>;
  await act(async () => { refresh = current.refreshAfterSaves(flushSaves); });
  expect(read).toHaveBeenCalledOnce();
  expect(oldSignal.aborted).toBe(false);
  read.mockResolvedValueOnce({ ...snapshot, currentBranch: "fresh" });
  await act(async () => { finishSave(); await refresh; });
  await tick();
  expect(oldSignal.aborted).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => finishOld(snapshot));
  await tick();
  expect(current.data?.currentBranch).toBe("fresh");
});

it("does not refresh when a save fails or the requesting screen leaves", async () => {
  await render();
  const failure = new Error("Save failed.");
  await act(async () => {
    await expect(current.refreshAfterSaves(async () => { throw failure; })).rejects.toBe(failure);
  });
  const controller = new AbortController();
  let finishSave!: () => void;
  let refresh!: Promise<unknown>;
  await act(async () => {
    refresh = current.refreshAfterSaves(() => new Promise<void>((resolve) => { finishSave = resolve; }), controller.signal);
  });
  controller.abort();
  await render(otherProjectId, false);
  await act(async () => { finishSave(); await refresh; });
  expect(read).toHaveBeenCalledOnce();
});

it("exposes refresh failures with cached data until manually retried", async () => {
  await render();
  read.mockResolvedValueOnce(null);
  await act(async () => { await current.refetch(); });
  await tick();
  expect(current.isRefetchError).toBe(true);
  expect(current.error?.message).toBe("Unable to load project changes. Please try again.");
  expect(current.data).toEqual(snapshot);
  await tick(30_000);
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => { await current.refetch(); });
  await tick();
  expect(current.isSuccess).toBe(true);
  expect(current.error).toBeNull();
  expect(read).toHaveBeenCalledTimes(3);
});

it("exposes initial failures without immediate retries and supports manual refetch", async () => {
  read.mockResolvedValue(null);
  await render();
  expect(current.isLoadingError).toBe(true);
  expect(current.data).toBeUndefined();
  await tick(2_000);
  expect(read).toHaveBeenCalledOnce();
  read.mockResolvedValue(snapshot);
  await act(async () => { await current.refetch(); });
  await tick();
  expect(current.isSuccess).toBe(true);
});

it("does not refresh cached changes on focus or reconnect", async () => {
  await render();
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await tick();
  act(() => onlineManager.setOnline(false));
  await tick(20_000);
  act(() => onlineManager.setOnline(true));
  await tick();
  expect(read).toHaveBeenCalledOnce();
});

it("loads local changes while offline", async () => {
  act(() => onlineManager.setOnline(false));
  await render();
  expect(current.fetchStatus).toBe("idle");
  expect(read).toHaveBeenCalledOnce();
  act(() => onlineManager.setOnline(true));
  await tick();
  expect(current.isSuccess).toBe(true);
  expect(read).toHaveBeenCalledOnce();
});

it("works locally without an account or session", async () => { await render(); expect(read).toHaveBeenCalledOnce(); });

it.each([null, "", "invalid"])("blocks invalid project IDs, including manual refetch: %s", async (id) => {
  await render(id);
  await act(async () => { await current.refetch(); });
  expect(read).not.toHaveBeenCalled();
});

it("loads when enabled without refreshing cached data on reactivation", async () => {
  await render(projectId, false);
  await tick(20_000);
  expect(read).not.toHaveBeenCalled();
  await render(projectId, true);
  expect(current.isSuccess).toBe(true);
  await render(projectId, false);
  await tick(20_000);
  await render(projectId, true);
  expect(read).toHaveBeenCalledOnce();
});

it("isolates projects without showing a previous project's data", async () => {
  await render();
  read.mockImplementationOnce(() => new Promise(() => {}));
  await render(otherProjectId);
  expect(current.data).toBeUndefined();
  expect(current.isPending).toBe(true);
  await render();
  expect(current.data).toEqual(snapshot);
  expect(client.getQueryData(["projects", "changes", projectId])).toEqual(snapshot);
  expect(client.getQueryCache().getAll().filter((query) => query.queryKey[1] === "changes")).toHaveLength(2);
});

it("reuses cached data when remounted", async () => {
  await render();
  act(() => root.render(null));
  await render();
  expect(read).toHaveBeenCalledOnce();
});

it("cancels in-flight requests on unmount", async () => {
  let requestSignal: AbortSignal | undefined;
  read.mockImplementation((_id, signal) => new Promise((resolve) => {
    requestSignal = signal;
    signal?.addEventListener("abort", () => resolve(null), { once: true });
  }));
  await render();
  expect(requestSignal?.aborted).toBe(false);
  act(() => root.render(null));
  await tick(20_000);
  expect(requestSignal?.aborted).toBe(true);
  expect(read).toHaveBeenCalledOnce();
});


it.each(["active", "disabled", "unmounted"])("refreshes a save-invalidated snapshot when the panel is %s", async (state) => {
  await render();
  if (state === "disabled") await render(projectId, false);
  if (state === "unmounted") act(() => root.render(null));
  const next = { ...snapshot, observedAt: "2026-09-14T00:00:00Z" };
  read.mockResolvedValue(next);
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["projects", "changes", projectId], exact: true });
  });
  await tick();
  if (state !== "active") {
    expect(read).toHaveBeenCalledOnce();
    await render();
  }
  expect(read).toHaveBeenCalledTimes(2);
  expect(current.data).toEqual(next);
  await tick(30_000);
  expect(read).toHaveBeenCalledTimes(2);
});
