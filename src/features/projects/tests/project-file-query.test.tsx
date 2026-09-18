// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readProjectFileContentAction } from "@/features/projects/actions/file-actions";
import { useProjectFile } from "@/features/projects/hooks/use-project-file";
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
  expect(client.getQueryData(["projects", "file", "project-one", file.path])).toEqual(file);
});

it.each([undefined, false, true])("refreshes a recently cached file only when freshOnMount is enabled (%s)", async (freshOnMount) => {
  const cached = { ...file, content: "old", size: 3 };
  client.setQueryData(["projects", "file", "project-one", file.path], cached);
  await render("project-one", file.path, freshOnMount);
  expect(read).toHaveBeenCalledTimes(freshOnMount ? 1 : 0);
  expect(current.data).toEqual(freshOnMount ? file : cached);
});

it("works locally without an account or session", async () => { await render(); expect(read).toHaveBeenCalledOnce(); });

it.each([["", "file.ts"], ["project-one", ""], ["project-one", null]])("does not request a missing project or file (%s, %s)", async (projectId, path) => {
  await render(projectId!, path);
  expect(current.fetchStatus).toBe("idle");
  await act(async () => { await current.refetch(); });
  expect(read).not.toHaveBeenCalled();
});

it("isolates cached files and projects", async () => {
  await render();
  const other = { ...file, path: "src/other.ts", content: "other", size: 5 };
  read.mockResolvedValue(other);
  await render("project-one", other.path);
  expect(current.data).toEqual(other);
  await render("project-two", other.path);
  await render("project-two", other.path);
  expect(read).toHaveBeenCalledTimes(3);
  expect(client.getQueryData(["projects", "file", "project-one", file.path])).toEqual(file);
  expect(client.getQueryData(["projects", "file", "project-two", other.path])).toEqual(other);
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
