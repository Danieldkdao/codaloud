import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { refreshProjectGitQueries } from "../lib/git-cache";

const projectId = "11111111-1111-4111-8111-111111111111";
const workspace = { projectId };
const snapshots = (project: string) => [
  ["projects", "commits", "infinite", "cursor", project, { source: "local" }],
  ["projects", "commits", "infinite", "cursor", project, { source: "remote" }],
  ["projects", "branches", "infinite", "cursor", project, "local"],
  ["projects", "file-search", "infinite", project],
  ["projects", "stashes", "infinite", project],
  ["projects", "discard-preview", project],
];
const documents = (project: string) => [
  ...["file", "files", "changes", "git-counts", "commit-details", "detail"].map((kind) => ["projects", kind, project]),
  ["projects", "file", project, "src/file.ts"],
  ["projects", "files", project, "src/nested"],
];

it("resets cursor snapshots and invalidates all workspace documents without touching other projects", async () => {
  const client = new QueryClient();
  const reset = snapshots(projectId);
  const invalidated = documents(projectId);
  const unrelated = [...snapshots("other-project"), ...documents("other-project")];
  for (const key of [...reset, ...invalidated, ...unrelated]) client.setQueryData(key, { cached: true });
  await refreshProjectGitQueries(client, workspace);
  for (const key of reset) expect(client.getQueryData(key)).toBeUndefined();
  for (const key of invalidated) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of unrelated) {
    expect(client.getQueryData(key)).toEqual({ cached: true });
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  }
  client.clear();
});

it("cancels an initial file read before refetching so it cannot overwrite the newer contents", async () => {
  const client = new QueryClient();
  const queryKey = ["projects", "file", projectId, "file.ts"];
  let finish!: (value: string) => void;
  let signal!: AbortSignal;
  const read = vi.fn().mockImplementationOnce((context) => {
    signal = context.signal;
    return new Promise((resolve) => { finish = resolve; });
  }).mockResolvedValue("new contents");
  const observer = new QueryObserver(client, { queryKey, queryFn: read, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  await refreshProjectGitQueries(client, workspace);
  expect(signal.aborted).toBe(true);
  finish("old contents");
  await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(queryKey)).toBe("new contents");
  unsubscribe();
  client.clear();
});

it("refreshes GitHub branch pickers after remote operations", async () => {
  const client = new QueryClient();
  const key = ["github", "repositories", "repo", "branches", "infinite", "cursor", "github-user"];
  const other = [...key.slice(0, 6), "other-user"];
  client.setQueryData(key, { pages: [] });
  client.setQueryData(other, { pages: [] });
  await refreshProjectGitQueries(client, workspace, { remote: true });
  expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryData(other)).toBeUndefined();
  client.clear();
});

it("does not turn a successful write into a failure when refreshing fails", async () => {
  const client = new QueryClient();
  vi.spyOn(client, "resetQueries").mockRejectedValueOnce(new Error("refresh failed"));
  await expect(refreshProjectGitQueries(client, workspace)).resolves.toBeUndefined();
  client.clear();
});
