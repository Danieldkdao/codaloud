// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readProjectCommitDetailsAction } from "../actions/git-actions";
import type { ProjectCommitDetailsSchema } from "../actions/commit-details-schemas";
import { useProjectCommitDetails } from "../hooks/use-project-commit-details";
vi.mock("../actions/git-actions", () => ({ readProjectCommitDetailsAction: vi.fn() }));

const read = vi.mocked(readProjectCommitDetailsAction);
const projectId = "11111111-1111-4111-8111-111111111111";
const commitSha = "a".repeat(40);
const details: ProjectCommitDetailsSchema = {
  source: "local",
  commit: { hash: commitSha, message: "Empty commit", author: "Ada", authorEmail: "ada@example.com",
    committer: "Ada", committerEmail: "ada@example.com", authoredAt: "2026-09-15T12:00:00Z",
    committedAt: "2026-09-15T12:00:00Z", parentHashes: [], isMerge: false },
  baseSha: null, files: [], summary: { fileCount: 0, additions: 0, deletions: 0, unavailableCount: 0 }, githubUrl: null,
};
const key = ["projects", "commit-details", projectId, commitSha, "local"];
type Options = Parameters<typeof useProjectCommitDetails>[1];
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjectCommitDetails>;
const Probe = ({ id, options }: { id: string | null | undefined; options: Options }) => {
  current = useProjectCommitDetails(id, options);
  return null;
};
const tick = async (milliseconds = 1) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
};
const render = async (id: string | null | undefined = projectId, options: Options = { commitSha, source: "local" }) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { id, options })));
  });
  await tick();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 3 } } });
  root = createRoot(document.createElement("div"));
  read.mockReset().mockResolvedValue(details);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("returns the useQuery result and forwards the identity and cancellation signal", async () => {
  await render();
  expect(current.isSuccess).toBe(true);
  expect(current.data).toEqual(details);
  expect(current.data?.files).toEqual([]);
  expect(current.refetch).toBeTypeOf("function");
  expect(read).toHaveBeenCalledExactlyOnceWith(projectId, { commitSha, source: "local" }, expect.any(AbortSignal));
  expect(client.getQueryData(key)).toEqual(details);
});

it("works locally without an account or session", async () => { await render(); expect(read).toHaveBeenCalledOnce(); });

it.each([
  [null, { commitSha, source: "local" }], ["invalid", { commitSha, source: "local" }],
  [projectId, {}], [projectId, { commitSha }], [projectId, { source: "local" }],
  [projectId, { commitSha: "HEAD", source: "local" }],
  [projectId, { commitSha, source: "invalid" }],
])("blocks invalid identities even on manual refetch: %j", async (id, options) => {
  await render(id, options as Options);
  expect(current.fetchStatus).toBe("idle");
  await act(async () => { await current.refetch(); });
  expect(read).not.toHaveBeenCalled();
});

it("starts loading when enabled", async () => {
  await render(projectId, { commitSha, source: "local", enabled: false });
  expect(read).not.toHaveBeenCalled();
  await render();
  expect(current.isSuccess).toBe(true);
});

it.each(["project", "sha", "source"])("isolates the cache when the %s changes", async (field) => {
  await render();
  read.mockImplementationOnce(() => new Promise(() => {}));
  await render(field === "project" ? "22222222-2222-4222-8222-222222222222" : projectId, {
    commitSha: field === "sha" ? "b".repeat(40) : commitSha,
    source: field === "source" ? "remote" : "local",
  });
  expect(current.isPending).toBe(true);
  expect(current.data).toBeUndefined();
  expect(client.getQueryData(key)).toEqual(details);
  expect(client.getQueryCache().getAll()).toHaveLength(2);
});

it("exposes a null action result as an error without retries and supports refetch", async () => {
  read.mockResolvedValue(null);
  await render();
  await tick(30_000);
  expect(current.isError).toBe(true);
  expect(current.error?.message).toBe("Unable to load commit details. Please try again.");
  expect(read).toHaveBeenCalledOnce();
  read.mockResolvedValue(details);
  await act(async () => { await current.refetch(); });
  await tick();
  expect(current.isSuccess).toBe(true);
  expect(current.data).toEqual(details);
});

it("cancels an in-flight read when the hook unmounts", async () => {
  read.mockImplementation((_id, _params, signal) => new Promise((resolve) => {
    signal?.addEventListener("abort", () => resolve(null), { once: true });
  }));
  await render();
  const signal = read.mock.calls[0][2]!;
  expect(signal.aborted).toBe(false);
  act(() => root.render(null));
  await tick();
  expect(signal.aborted).toBe(true);
  expect(client.getQueryState(key)?.error).toBeNull();
});
