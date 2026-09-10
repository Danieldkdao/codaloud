// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), create: vi.fn(), update: vi.fn(),
  session: { isPending: false, error: null, data: { user: { id: "user-one" } } as { user: { id: string } } | null },
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => mocks.session }));
vi.mock("@/features/projects/actions/file-actions", () => ({ readProjectFilesAction: mocks.read, createProjectFileAction: mocks.create, updateProjectFileAction: mocks.update }));
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProjectFiles>;
const entry = { name: "hello.txt", path: "notes/hello.txt", isDir: false, size: 0 };
const Probe = ({ path }: { path: string }) => { current = useProjectFiles("project-one", path); return null; };
const render = async (path = "") => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { path })));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  root = createRoot(document.createElement("div"));
  mocks.session.data = { user: { id: "user-one" } };
  mocks.read.mockReset().mockResolvedValue([]);
  mocks.create.mockReset().mockResolvedValue({ error: false, message: "Created.", data: entry });
  mocks.update.mockReset().mockResolvedValue({ error: false, message: "Updated.", data: entry });
});
afterEach(() => { act(() => root.unmount()); client.clear(); });

it("caches folders separately and does not reuse another account's entries", async () => {
  mocks.read.mockResolvedValue([entry]);
  await render("notes");
  expect(current.query.data).toEqual([entry]);
  expect(mocks.read).toHaveBeenCalledWith("project-one", "notes", expect.any(AbortSignal));
  mocks.read.mockResolvedValue([]);
  await render("other");
  expect(current.query.data).toEqual([]);
  expect(client.getQueryData(["projects", "files", "user-one", "project-one", "notes"])).toEqual([entry]);
  mocks.session.data = { user: { id: "user-two" } };
  await render("notes");
  expect(current.query.data).toEqual([]);
});

it("does not fetch or mutate without a verified session", async () => {
  mocks.session.data = null;
  await render();
  await act(async () => { await current.query.refetch(); });
  expect(mocks.read).not.toHaveBeenCalled();
  await act(async () => {
    await expect(current.creation.mutateAsync({ parentPath: "", name: "hello.txt", kind: "file" })).rejects.toThrow();
  });
  expect(mocks.create).not.toHaveBeenCalled();
  await act(async () => {
    await expect(current.update.mutateAsync({ parentPath: "", previousName: "old.txt", name: "hello.txt", kind: "file" })).rejects.toThrow();
  });
  expect(mocks.update).not.toHaveBeenCalled();
});

it("keeps rename pending without optimistic changes and updates only the captured account and folder", async () => {
  let resolve!: (value: unknown) => void;
  mocks.update.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const previousEntry = { ...entry, name: "old.txt", path: "notes/old.txt" };
  mocks.read.mockResolvedValue([previousEntry]);
  await render("notes");
  const queryKey = ["projects", "files", "user-one", "project-one", "notes"];
  let update!: Promise<unknown>;
  await act(async () => { update = current.update.mutateAsync({ parentPath: "notes", previousName: "old.txt", name: "hello.txt", kind: "file" }); });
  expect(client.getQueryData(queryKey)).toEqual([previousEntry]);
  mocks.session.data = { user: { id: "user-two" } };
  mocks.read.mockResolvedValue([]);
  await render("other");
  await act(async () => { resolve({ error: false, message: "Updated.", data: entry }); await update; });
  expect(mocks.update).toHaveBeenCalledWith("project-one", { parentPath: "notes", previousName: "old.txt", name: "hello.txt", kind: "file" });
  expect(client.getQueryData(queryKey)).toEqual([entry]);
  expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
  expect(current.query.data).toEqual([]);
  expect(client.getQueryData(["projects", "files", "user-two", "project-one", "notes"])).toBeUndefined();
});

it("clears stale subtree caches after a folder rename without clearing similarly named siblings", async () => {
  await render("other");
  const prefix = ["projects", "files", "user-one", "project-one"];
  for (const path of ["old", "old/nested", "new", "new/nested", "old-sibling", "unrelated"]) {
    client.setQueryData([...prefix, path], [entry]);
  }
  const updatedFolder = { name: "new", path: "new", isDir: true, size: 0 };
  client.setQueryData([...prefix, ""], [{ ...updatedFolder, name: "old", path: "old" }]);
  mocks.update.mockResolvedValue({ error: false, message: "Updated.", data: updatedFolder });
  await act(async () => { await current.update.mutateAsync({ parentPath: "", previousName: "old", name: "new", kind: "folder" }); });
  expect(client.getQueryData([...prefix, ""])).toEqual([updatedFolder]);
  for (const path of ["old", "old/nested", "new", "new/nested"]) expect(client.getQueryData([...prefix, path])).toBeUndefined();
  for (const path of ["old-sibling", "unrelated"]) expect(client.getQueryData([...prefix, path])).toEqual([entry]);
});

it("does not change cached names or retry when the server rejects rename", async () => {
  mocks.read.mockResolvedValue([entry]);
  mocks.update.mockResolvedValue({ error: true, message: "Choose another name." });
  await render("notes");
  await act(async () => {
    await expect(current.update.mutateAsync({ parentPath: "notes", previousName: "hello.txt", name: "taken.txt", kind: "file" })).rejects.toThrow("Choose another name.");
  });
  expect(current.query.data).toEqual([entry]);
  expect(mocks.update).toHaveBeenCalledTimes(1);
});

it("turns a failed read into an error instead of an empty directory", async () => {
  mocks.read.mockResolvedValue(null);
  await render();
  expect(current.query.isError).toBe(true);
  expect(current.query.data).toBeUndefined();
});

it("refreshes the captured parent after creation even if navigation changes", async () => {
  let resolve!: (value: unknown) => void;
  mocks.create.mockImplementation(() => new Promise((done) => { resolve = done; }));
  await render("notes");
  let creation!: Promise<unknown>;
  await act(async () => { creation = current.creation.mutateAsync({ parentPath: "notes", name: "hello.txt", kind: "file" }); });
  await render("other");
  await act(async () => { resolve({ error: false, message: "Created.", data: entry }); await creation; });
  expect(client.getQueryData(["projects", "files", "user-one", "project-one", "notes"])).toEqual([entry]);
  expect(client.getQueryState(["projects", "files", "user-one", "project-one", "notes"])?.isInvalidated).toBe(true);
  expect(current.query.data).toEqual([]);
});
