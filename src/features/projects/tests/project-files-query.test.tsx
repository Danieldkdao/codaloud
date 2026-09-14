// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  session: { isPending: false, error: null, data: { user: { id: "user-one" } } as { user: { id: string } } | null },
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => mocks.session }));
vi.mock("@/features/projects/actions/file-actions", () => ({ readProjectFilesAction: mocks.read, createProjectFileAction: mocks.create, updateProjectFileAction: mocks.update, deleteProjectFileAction: mocks.delete }));
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
  mocks.delete.mockReset().mockResolvedValue({ error: false, message: "Deleted.", data: entry });
  mocks.update.mockReset().mockResolvedValue({ error: false, message: "Updated.", data: entry });
});
afterEach(() => { act(() => root.unmount()); client.clear(); vi.useRealTimers(); });

const renderWithTimers = async (path = "") => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { path })));
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
};

it("keeps loading during restoration and retries after the server's delay", async () => {
  vi.useFakeTimers();
  mocks.read.mockImplementationOnce(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  }).mockResolvedValue([entry]);
  await renderWithTimers();
  expect(current.query.isPending).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
  expect(mocks.read).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2); });
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(current.query.data).toEqual([entry]);
  expect(current.query.isError).toBe(false);
});

it("keeps checking long restorations until the folder loads, then stops", async () => {
  vi.useFakeTimers();
  mocks.read.mockImplementation(async (_project, _path, _signal, onRestoring) => {
    onRestoring("3");
    return null;
  });
  await renderWithTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(90_001); });
  expect(mocks.read.mock.calls.length).toBeGreaterThan(21);
  expect(current.query.isPending).toBe(true);
  mocks.read.mockResolvedValue([entry]);
  await act(async () => { await vi.advanceTimersByTimeAsync(3_001); });
  expect(current.query.data).toEqual([entry]);
  expect(current.query.isSuccess).toBe(true);
  const completedReads = mocks.read.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(mocks.read).toHaveBeenCalledTimes(completedReads);
});

it("cancels the old folder's restoration retry when navigation changes", async () => {
  vi.useFakeTimers();
  mocks.read.mockImplementation(async (_project, path, _signal, onRestoring) => {
    if (path === "old") { onRestoring("3"); return null; }
    return [];
  });
  await renderWithTimers("old");
  const signal = mocks.read.mock.calls[0][2] as AbortSignal;
  await renderWithTimers("new");
  expect(signal.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(mocks.read.mock.calls.filter((call) => call[1] === "old")).toHaveLength(1);
  expect(current.query.data).toEqual([]);
});

it("caches folders separately and does not reuse another account's entries", async () => {
  mocks.read.mockResolvedValue([entry]);
  await render("notes");
  expect(current.query.data).toEqual([entry]);
  expect(mocks.read).toHaveBeenCalledWith("project-one", "notes", expect.any(AbortSignal), expect.any(Function));
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
  await act(async () => {
    await expect(current.deletion.mutateAsync({ parentPath: "", name: "hello.txt", kind: "file" })).rejects.toThrow();
  });
  expect(mocks.delete).not.toHaveBeenCalled();
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

it("keeps a pending deletion visible and applies success only to its captured account and folder", async () => {
  let resolve!: (value: unknown) => void;
  mocks.delete.mockImplementation(() => new Promise((done) => { resolve = done; }));
  mocks.read.mockResolvedValue([entry]);
  await render("notes");
  const key = ["projects", "files", "user-one", "project-one", "notes"];
  let deletion!: Promise<unknown>;
  await act(async () => { deletion = current.deletion.mutateAsync({ parentPath: "notes", name: "hello.txt", kind: "file" }); });
  expect(client.getQueryData(key)).toEqual([entry]);
  mocks.session.data = { user: { id: "user-two" } };
  await render("other");
  await act(async () => { resolve({ error: false, message: "Deleted.", data: entry }); await deletion; });
  expect(client.getQueryData(key)).toEqual([]);
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(current.query.data).toEqual([entry]);
});

it("removes deleted folder caches including descendants but preserves siblings and other accounts", async () => {
  await render("other");
  const prefix = ["projects", "files", "user-one", "project-one"];
  const folder = { name: "old", path: "old", isDir: true, size: 0 };
  for (const path of ["old", "old/nested", "old-sibling", "unrelated"]) client.setQueryData([...prefix, path], [entry]);
  const otherAccount = ["projects", "files", "user-two", "project-one", "old"];
  client.setQueryData(otherAccount, [entry]);
  client.setQueryData([...prefix, ""], [folder]);
  mocks.delete.mockResolvedValue({ error: false, message: "Deleted.", data: folder });
  await act(async () => { await current.deletion.mutateAsync({ parentPath: "", name: "old", kind: "folder" }); });
  expect(client.getQueryData([...prefix, ""])).toEqual([]);
  for (const path of ["old", "old/nested"]) expect(client.getQueryData([...prefix, path])).toBeUndefined();
  for (const path of ["old-sibling", "unrelated"]) expect(client.getQueryData([...prefix, path])).toEqual([entry]);
  expect(client.getQueryData(otherAccount)).toEqual([entry]);
});

it("keeps files visible after a failed deletion and does not retry it", async () => {
  mocks.read.mockResolvedValue([entry]);
  mocks.delete.mockResolvedValue({ error: true, message: "Refresh the folder." });
  await render("notes");
  await act(async () => {
    await expect(current.deletion.mutateAsync({ parentPath: "notes", name: "hello.txt", kind: "file" })).rejects.toThrow("Refresh the folder.");
  });
  expect(current.query.data).toEqual([entry]);
  expect(mocks.delete).toHaveBeenCalledTimes(1);
});

it.each(["creation", "update", "deletion"] as const)("clears only affected content caches after %s succeeds, using the submitted account", async (operation) => {
  await render("other");
  const paths = ["old", "old/nested/file.ts", "new", "new/nested/file.ts", "old-sibling/file.ts", "new-sibling/file.ts", "unrelated"];
  const key = (user: string, project: string, path: string) => ["projects", "file", user, project, path];
  for (const path of paths) {
    for (const [user, project] of [["user-one", "project-one"], ["user-two", "project-one"], ["user-one", "project-two"]]) {
      client.setQueryData(key(user, project, path), { path, content: "old contents", size: 12 });
    }
  }
  const result = { name: operation === "deletion" ? "old" : "new", path: operation === "deletion" ? "old" : "new", isDir: true, size: 0 };
  let resolve!: (value: unknown) => void;
  const action = operation === "creation" ? mocks.create : operation === "update" ? mocks.update : mocks.delete;
  action.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  let mutation!: Promise<unknown>;
  await act(async () => {
    mutation = current[operation].mutateAsync({ parentPath: "", previousName: "old", name: result.name, kind: "folder" });
  });
  expect(client.getQueryData(key("user-one", "project-one", result.path))).toBeDefined();
  mocks.session.data = { user: { id: "user-two" } };
  await render("another");
  await act(async () => { resolve({ error: false, message: "Done.", data: result }); await mutation; });
  const affected = operation === "update" ? ["old", "new"] : [result.path];
  for (const path of paths) {
    const shouldRemove = affected.some((root) => path === root || path.startsWith(`${root}/`));
    expect(client.getQueryData(key("user-one", "project-one", path)) === undefined).toBe(shouldRemove);
    expect(client.getQueryData(key("user-two", "project-one", path))).toBeDefined();
    expect(client.getQueryData(key("user-one", "project-two", path))).toBeDefined();
  }
});

it.each(["creation", "update", "deletion"] as const)("cancels old content reads before clearing a %s path", async (operation) => {
  await render("other");
  const path = entry.path;
  const queryKey = ["projects", "file", "user-one", "project-one", path];
  let finish!: (value: unknown) => void;
  let signal!: AbortSignal;
  const read = client.fetchQuery({ queryKey, queryFn: (context) => {
    signal = context.signal;
    return new Promise((resolve) => { finish = resolve; });
  } }).catch(() => null);
  await act(async () => {
    await current[operation].mutateAsync({ parentPath: "notes", previousName: "old.txt", name: "hello.txt", kind: "file" });
  });
  expect(signal.aborted).toBe(true);
  expect(client.getQueryState(queryKey)).toBeUndefined();
  finish({ path, content: "obsolete", size: 8 });
  await read;
  expect(client.getQueryData(queryKey)).toBeUndefined();
});

it.each(["creation", "update", "deletion"] as const)("preserves file contents after a failed %s", async (operation) => {
  await render("notes");
  const queryKey = ["projects", "file", "user-one", "project-one", entry.path];
  const content = { path: entry.path, content: "keep", size: 4 };
  client.setQueryData(queryKey, content);
  const action = operation === "creation" ? mocks.create : operation === "update" ? mocks.update : mocks.delete;
  action.mockResolvedValueOnce({ error: true, message: "Operation failed." });
  await act(async () => {
    await expect(current[operation].mutateAsync({ parentPath: "notes", previousName: "hello.txt", name: "hello.txt", kind: "file" })).rejects.toThrow("Operation failed.");
  });
  expect(client.getQueryData(queryKey)).toEqual(content);
});

it("retains content for a rename that does not change the path", async () => {
  await render("notes");
  const queryKey = ["projects", "file", "user-one", "project-one", entry.path];
  const content = { path: entry.path, content: "keep", size: 4 };
  client.setQueryData(queryKey, content);
  await act(async () => {
    await current.update.mutateAsync({ parentPath: "notes", previousName: "hello.txt", name: "hello.txt", kind: "file" });
  });
  expect(client.getQueryData(queryKey)).toEqual(content);
});


it.each([
  ["update", "file", true], ["update", "folder", true],
  ["deletion", "file", true], ["deletion", "folder", true],
  ["update", "file", false], ["update", "folder", false],
  ["deletion", "file", false], ["deletion", "folder", false],
] as const)("refreshes changes after %s of a %s succeeds (active: %s)", async (operation, kind, active) => {
  const key = ["projects", "changes", "user-one", "project-one"];
  const unrelated = [
    ["projects", "changes", "user-two", "project-one"],
    ["projects", "changes", "user-one", "project-two"],
  ];
  for (const queryKey of [key, ...unrelated]) client.setQueryData(queryKey, { revision: "before" });
  const fetchChanges = vi.fn().mockResolvedValue({ revision: "after" });
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fetchChanges, staleTime: Infinity, enabled: active });
  const unsubscribe = observer.subscribe(() => {});
  try {
    let finish!: (value: unknown) => void;
    const action = operation === "update" ? mocks.update : mocks.delete;
    action.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render("notes");
    let mutation!: Promise<unknown>;
    await act(async () => {
      mutation = operation === "update"
        ? current.update.mutateAsync({ parentPath: "notes", previousName: "old", name: "new", kind })
        : current.deletion.mutateAsync({ parentPath: "notes", name: "old", kind });
    });
    expect(fetchChanges).not.toHaveBeenCalled();
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    // Navigation/session changes must not redirect the mutation's invalidation.
    mocks.session.data = { user: { id: "user-two" } };
    await render("other");
    const name = operation === "update" ? "new" : "old";
    await act(async () => {
      finish({ error: false, message: "Done.", data: { name, path: `notes/${name}`, isDir: kind === "folder", size: 0 } });
      await mutation;
    });
    if (active) {
      expect(fetchChanges).toHaveBeenCalledOnce();
      expect(client.getQueryData(key)).toEqual({ revision: "after" });
    } else {
      expect(fetchChanges).not.toHaveBeenCalled();
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    for (const queryKey of unrelated) expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
  } finally { unsubscribe(); }
});

it.each([
  ["update", "file"], ["update", "folder"],
  ["deletion", "file"], ["deletion", "folder"],
] as const)("does not invalidate changes when %s of a %s fails", async (operation, kind) => {
  const key = ["projects", "changes", "user-one", "project-one"];
  client.setQueryData(key, { revision: "before" });
  (operation === "update" ? mocks.update : mocks.delete).mockResolvedValueOnce({ error: true, message: "Operation failed." });
  await render("notes");
  await act(async () => {
    const mutation = operation === "update"
      ? current.update.mutateAsync({ parentPath: "notes", previousName: "old", name: "new", kind })
      : current.deletion.mutateAsync({ parentPath: "notes", name: "old", kind });
    await expect(mutation).rejects.toThrow("Operation failed.");
  });
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
});
