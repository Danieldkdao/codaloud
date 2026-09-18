// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readProjectFileContentAction } from "@/features/projects/actions/file-actions";
import { useProjectFile } from "@/features/projects/hooks/use-project-file";

const session = vi.hoisted(() => ({
  isPending: false,
  error: null as Error | null,
  data: { user: { id: "user-one" } } as { user: { id: string } } | null,
}));
vi.mock("@/features/workspace/hooks/use-device-workspace", () => ({
  useDeviceWorkspace: () => ((state: { isPending?: boolean; error?: unknown; data?: { user: { id: string } } | null }) => ({
    ready: !state.isPending,
    workspace: !state.isPending && !state.error && state.data ? { ownerId: state.data.user.id } : null,
  }))(session),
}));
vi.mock("@/features/projects/actions/file-actions", () => ({ readProjectFileContentAction: vi.fn() }));

const read = vi.mocked(readProjectFileContentAction);
const file = { path: "src/main.ts", content: "", size: 0 };
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjectFile>;
const Probe = ({ projectId, path, freshOnMount }: { projectId: string; path: string | null; freshOnMount?: boolean }) => {
  current = { ...useProjectFile(projectId, path, { freshOnMount }) };
  return null;
};
const advance = async (milliseconds: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
};
const render = async (projectId = "project-one", path: string | null = file.path, freshOnMount?: boolean) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { projectId, path, freshOnMount })));
  });
  await advance(1);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient();
  root = createRoot(document.createElement("div"));
  session.isPending = false;
  session.error = null;
  session.data = { user: { id: "user-one" } };
  read.mockReset().mockResolvedValue(file);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.useRealTimers();
});

it("returns the query result with empty file contents and forwards cancellation", async () => {
  await render();
  expect(current.isSuccess).toBe(true);
  expect(current.data).toEqual(file);
  expect(current.refetch).toEqual(expect.any(Function));
  expect(read).toHaveBeenCalledExactlyOnceWith("project-one", file.path, expect.any(AbortSignal), expect.any(Function));
  expect(client.getQueryData(["projects", "file", "user-one", "project-one", file.path])).toEqual(file);
});

it.each([undefined, false, true])("refreshes a recently cached file only when freshOnMount is enabled (%s)", async (freshOnMount) => {
  const cached = { ...file, content: "old", size: 3 };
  client.setQueryData(["projects", "file", "user-one", "project-one", file.path], cached);
  await render("project-one", file.path, freshOnMount);
  expect(read).toHaveBeenCalledTimes(freshOnMount ? 1 : 0);
  expect(current.data).toEqual(freshOnMount ? file : cached);
});

it.each(["pending", "signed-out", "error"])("waits for workspace initialization when %s, including manual refetch", async (state) => {
  if (state === "pending") session.isPending = true;
  if (state === "signed-out") session.data = null;
  if (state === "error") session.error = new Error("Session unavailable");
  await render();
  expect(current.fetchStatus).toBe("idle");
  await act(async () => { await current.refetch(); });
  expect(read).not.toHaveBeenCalled();
});

it.each([["", "file.ts"], ["project-one", ""], ["project-one", null]])("does not request a missing project or file (%s, %s)", async (projectId, path) => {
  await render(projectId!, path);
  expect(current.fetchStatus).toBe("idle");
  await act(async () => { await current.refetch(); });
  expect(read).not.toHaveBeenCalled();
});

it("loads after authentication resolves and isolates cached files, projects, and accounts", async () => {
  session.isPending = true;
  await render();
  session.isPending = false;
  await render();
  const other = { ...file, path: "src/other.ts", content: "other", size: 5 };
  read.mockResolvedValue(other);
  await render("project-one", other.path);
  expect(current.data).toEqual(other);
  await render("project-two", other.path);
  session.data = { user: { id: "user-two" } };
  await render("project-two", other.path);
  expect(read).toHaveBeenCalledTimes(4);
  expect(client.getQueryData(["projects", "file", "user-one", "project-one", file.path])).toEqual(file);
  expect(client.getQueryData(["projects", "file", "user-two", "project-two", other.path])).toEqual(other);
});

it.each(["FILE_TOO_LARGE", "FILE_NOT_FOUND", "UNAUTHENTICATED", "UNSUPPORTED_FILE_ENCODING"])("surfaces %s without automatic retries", async (code) => {
  read.mockImplementation(async (_project, _path, _signal, onFailure) => {
    onFailure?.({ error: true, code, message: "Cannot open this file." }, "3");
    return null;
  });
  await render();
  await advance(60_000);
  expect(current.isError).toBe(true);
  expect(current.error?.message).toBe("Cannot open this file.");
  expect(read).toHaveBeenCalledTimes(1);
});

it("turns a statusless null into an error and supports manual retry", async () => {
  read.mockResolvedValue(null);
  await render();
  expect(current.isError).toBe(true);
  expect(current.error?.message).toBe("Unable to load this file. Please try again.");
  await advance(30_000);
  expect(read).toHaveBeenCalledTimes(1);
  read.mockResolvedValue(file);
  await act(async () => { await current.refetch(); });
  await advance(1);
  expect(current.isSuccess).toBe(true);
});


it("ignores a delayed response from a file that is no longer active", async () => {
  let finish!: (value: typeof file) => void;
  read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  read.mockResolvedValue({ path: "second.ts", content: "second", size: 6 });
  await render("project-one", "second.ts");
  await act(async () => finish({ path: file.path, content: "late first", size: 10 }));
  await advance(1);
  expect(current.data).toMatchObject({ path: "second.ts", content: "second" });
});
