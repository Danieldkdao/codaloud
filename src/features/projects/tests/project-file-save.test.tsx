// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppStateStatus } from "react-native";
import { ProjectFileSaveRegistryProvider, ProjectFileSaveProvider, useProjectFileSave, useProjectFileSaveRegistry } from "@/features/projects/hooks/use-project-file-save";

import { useProjectEditorDocuments } from "../hooks/use-project-editor-documents";

const mocks = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn() }));
const lifecycle = vi.hoisted(() => ({ listeners: new Set<(state: AppStateStatus) => void>() }));
vi.mock("react-native", () => ({ AppState: { addEventListener: (_event: string, listener: (state: AppStateStatus) => void) => {
  lifecycle.listeners.add(listener);
  return { remove: () => lifecycle.listeners.delete(listener) };
} } }));
vi.mock("@/features/projects/actions/file-actions", () => ({ saveProjectFileContentAction: mocks.save, readProjectFileContentAction: mocks.read }));
vi.mock("@/features/workspace/hooks/use-device-workspace", () => ({
  useDeviceWorkspace: () => ((state: { isPending?: boolean; error?: unknown; data?: { user: { id: string } } | null }) => ({
    ready: !state.isPending,
    workspace: !state.isPending && !state.error && state.data ? { ownerId: state.data.user.id } : null,
  }))(({ isPending: false, data: { user: { id: "user-one" } } })),
}));
const hash = (content: string) => createHash("sha256").update(content).digest("hex");
const success = (content: string, path = "one.ts") => ({ error: false, message: "Saved.", data: { path, size: Buffer.byteLength(content), contentHash: hash(content) } });
let current: NonNullable<ReturnType<typeof useProjectFileSave>>;
let registry: ReturnType<typeof useProjectFileSaveRegistry>;
const Probe = () => { current = useProjectFileSave()!; registry = useProjectFileSaveRegistry(); return null; };
let root: Root;
let client: QueryClient;
const render = async (path = "one.ts", content = "original", version = 0, projectId = "project-one") => {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(ProjectFileSaveRegistryProvider, { projectId, children:
      createElement(ProjectFileSaveProvider, { key: `${path}/${version}`, filePath: path, version, initialValue: content, children: createElement(Probe) }),
    }),
  )));
};
const tick = async (ms = 3000) => { await act(async () => vi.advanceTimersByTimeAsync(ms)); };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.createElement("div"));
  mocks.save.mockReset().mockImplementation(async (_project, input) => success(input.content, input.path));
  mocks.read.mockReset().mockResolvedValue({ path: "one.ts", content: "original", size: 8 });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.useRealTimers(); });

it("flushes all pending documents, including edits and documents added while waiting", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => current.onChange("first"));
  let pending!: Promise<void>;
  const completed = vi.fn();
  await act(async () => { pending = registry.flushPendingSaves().then(completed); });
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(completed).not.toHaveBeenCalled();
  await act(async () => {
    current.onChange("second");
    registry.getDocument("two.ts", 0, "original").edit("another file");
  });
  await act(async () => { finish(success("first")); await pending; });
  expect(completed).toHaveBeenCalledOnce();
  expect(mocks.save.mock.calls.map((call) => [call[1].path, call[1].content])).toEqual([
    ["one.ts", "first"], ["one.ts", "second"], ["two.ts", "another file"],
  ]);
  expect(client.getQueryData(["projects", "file", "user-one", "project-one", "one.ts"])).toMatchObject({ content: "second" });
  await tick();
  expect(mocks.save).toHaveBeenCalledTimes(3);
});

it("retains save failures and requires an explicit editor retry before a flush can succeed", async () => {
  mocks.save.mockResolvedValueOnce({ error: true, message: "Connection failed." });
  await render();
  await act(async () => current.onChange("draft"));
  await act(async () => { await expect(registry.flushPendingSaves()).rejects.toThrow("Connection failed."); });
  await act(async () => { await expect(registry.flushPendingSaves()).rejects.toThrow("Code"); });
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(current.status).toBe("error");
  await act(async () => current.retry());
  await act(async () => { await expect(registry.flushPendingSaves()).resolves.toBeUndefined(); });
  expect(current.status).toBe("saved");
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

it.each([false, true])("rejects a flush when a rename is active (started during flush: %s)", async (duringFlush) => {
  await render();
  let finishSave!: (value: unknown) => void;
  let finishRename!: () => void;
  let rename!: Promise<void>;
  let pending: Promise<void> | undefined;
  if (duringFlush) {
    mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    await act(async () => current.onChange("first"));
    await act(async () => {
      pending = expect(registry.flushPendingSaves()).rejects.toThrow("rename");
    });
  }
  await act(async () => {
    rename = registry.renameFiles("one.ts", "renamed.ts", () => new Promise<void>((resolve) => { finishRename = resolve; }));
  });
  if (duringFlush) {
    await act(async () => { finishSave(success("first")); await pending; });
  }
  await act(async () => current.onChange("paused edit"));
  await act(async () => { await expect(registry.flushPendingSaves()).rejects.toThrow("rename"); });
  expect(mocks.save).toHaveBeenCalledTimes(duringFlush ? 1 : 0);
  await act(async () => { finishRename(); await rename; });
  await act(async () => { await registry.flushPendingSaves(); });
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", expect.objectContaining({ path: "renamed.ts", content: "paused edit" }));
});

it("debounces only edits for three seconds, retaining exact text and confirmed cache contents", async () => {
  await render();
  await tick();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(current.status).toBe("saved");
  await act(async () => current.onChange("first"));
  await tick(2000);
  await act(async () => current.onChange("你好\r\n"));
  expect(current.status).toBe("pending");
  await tick(2999);
  expect(mocks.save).not.toHaveBeenCalled();
  await tick(1);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("project-one", { path: "one.ts", content: "你好\r\n", expectedContentHash: hash("original") });
  expect(current.status).toBe("saved");
  expect(client.getQueryData(["projects", "file", "user-one", "project-one", "one.ts"])).toEqual({ path: "one.ts", content: "你好\r\n", size: 8 });
  expect(current.initialValue).toBe("original");
});

it("releases each clean document after navigating away", async () => {
  for (let index = 0; index < 25; index++) {
    const path = `file-${index}.ts`;
    await render(path);
    const previous = registry.getDocument(path, 0, "original");
    await render("other.ts");
    expect(registry.getDocument(path, 0, "original")).not.toBe(previous);
  }
  expect(mocks.save).not.toHaveBeenCalled();
});

it("releases an unused document only after its entire save queue settles", async () => {
  const finishes: ((value: unknown) => void)[] = [];
  mocks.save.mockImplementation(() => new Promise((resolve) => finishes.push(resolve)));
  await render();
  const previous = registry.getDocument("one.ts", 0, "original");
  await act(async () => current.onChange("first"));
  await tick();
  await act(async () => current.onChange("second"));
  await render("two.ts");
  expect(registry.getDocument("one.ts", 0, "original")).toBe(previous);
  await act(async () => finishes[0](success("first")));
  expect(registry.getDocument("one.ts", 0, "first")).toBe(previous);
  await act(async () => finishes[1](success("second")));
  expect(client.getQueryData(["projects", "file", "user-one", "project-one", "one.ts"])).toMatchObject({ content: "second" });
  expect(registry.getDocument("one.ts", 0, "second")).not.toBe(previous);
});

it("retains an uncertain save even when the draft was undone to the confirmed text", async () => {
  mocks.save.mockResolvedValue({ error: true, message: "Response lost." });
  await render();
  const previous = registry.getDocument("one.ts", 0, "original");
  await act(async () => current.onChange("first"));
  await tick();
  await act(async () => current.onChange("original"));
  await render("two.ts");
  expect(registry.getDocument("one.ts", 0, "original")).toBe(previous);
  await render();
  expect(current.status).not.toBe("saved");
  mocks.save.mockImplementation(async (_project, input) => success(input.content));
  await act(async () => current.retry());
  await render("two.ts");
  expect(registry.getDocument("one.ts", 0, "original")).not.toBe(previous);
});

it("keeps a shared document until its last editor disconnects", async () => {
  const shared = async (count: number) => {
    await act(async () => root.render(createElement(QueryClientProvider, { client },
      createElement(ProjectFileSaveRegistryProvider, { projectId: "project-one", children:
        Array.from({ length: count }, (_, index) => createElement(ProjectFileSaveProvider, {
          key: index, filePath: "one.ts", version: 0, initialValue: "original", children: createElement(Probe),
        })),
      }),
    )));
  };
  await shared(2);
  const previous = registry.getDocument("one.ts", 0, "original");
  await shared(1);
  expect(registry.getDocument("one.ts", 0, "original")).toBe(previous);
  await act(async () => current.onChange("edited"));
  await tick();
  expect(current.status).toBe("saved");
  await shared(0);
  expect(registry.getDocument("one.ts", 0, "edited")).not.toBe(previous);
});

it("registers a released document again when its consumer reconnects", async () => {
  await render();
  const previous = registry.getDocument("one.ts", 0, "original");
  await render("two.ts");
  // A retained React tree can reconnect its external-store subscription later.
  const disconnect = previous.subscribe(() => {});
  try {
    await act(async () => previous.edit("resumed draft"));
    await act(async () => lifecycle.listeners.forEach((listener) => listener("background")));
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("project-one", { path: "one.ts", content: "resumed draft", expectedContentHash: hash("original") });
    expect(registry.getDocument("one.ts", 0, "resumed draft")).toBe(previous);
  } finally {
    disconnect();
  }
});

it.each([true, false])("retains unused clean documents until rename settles (success: %s)", async (succeeds) => {
  await render();
  const previous = registry.getDocument("one.ts", 0, "original");
  let finish!: () => void;
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = registry.renameFiles("one.ts", "renamed.ts", () => new Promise<void>((resolve, reject) => {
      finish = () => succeeds ? resolve() : reject(new Error("Rename failed"));
    })).catch(() => {});
  });
  await render("two.ts");
  expect(registry.getDocument("one.ts", 0, "original")).toBe(previous);
  await act(async () => { finish(); await pending; });
  expect(registry.getDocument(succeeds ? "renamed.ts" : "one.ts", 0, "original")).not.toBe(previous);
});

it("does not remove a recreated path when the old document finishes saving", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => current.onChange("old draft"));
  await tick();
  await render("one.ts", "replacement", 1);
  const replacement = registry.getDocument("one.ts", 1, "replacement");
  await act(async () => finish(success("old draft")));
  expect(registry.getDocument("one.ts", 1, "replacement")).toBe(replacement);
  await act(async () => current.onChange("new draft"));
  await tick();
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: "new draft", expectedContentHash: hash("replacement") });
});

it.each(["inactive", "background"] as const)("flushes pending edits on %s without waiting for the debounce", async (state) => {
  await render();
  await act(async () => current.onChange("edited"));
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => lifecycle.listeners.forEach((listener) => listener(state)));
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("project-one", { path: "one.ts", content: "edited", expectedContentHash: hash("original") });
  expect(current.status).toBe("saved");
  await tick();
  expect(mocks.save).toHaveBeenCalledOnce();
});

it("drains newer edits behind an in-flight save on repeated background events", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => current.onChange("first"));
  await tick();
  await act(async () => current.onChange("second"));
  await act(async () => {
    lifecycle.listeners.forEach((listener) => listener("inactive"));
    lifecycle.listeners.forEach((listener) => listener("background"));
  });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async () => finish(success("first")));
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: "second", expectedContentHash: hash("first") });
  expect(current.status).toBe("saved");
});

it("keeps background save failures visible without retrying them on repeated events", async () => {
  mocks.save.mockResolvedValue({ error: true, message: "Offline." });
  await render();
  await act(async () => current.onChange("draft"));
  await act(async () => lifecycle.listeners.forEach((listener) => listener("background")));
  expect(current.status).toBe("error");
  await act(async () => lifecycle.listeners.forEach((listener) => listener("background")));
  await tick();
  expect(mocks.save).toHaveBeenCalledOnce();
  await render("two.ts");
  await render();
  expect(current.initialValue).toBe("draft");
});

it("cleans up the AppState subscription when the registry unmounts", async () => {
  await render();
  expect(lifecycle.listeners.size).toBe(1);
  await act(async () => root.render(null));
  expect(lifecycle.listeners.size).toBe(0);
});

it("serializes edits during a save and uses the previous successful hash for the next write", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => current.onChange("first"));
  await tick();
  expect(current.status).toBe("saving");
  await act(async () => current.onChange("second"));
  await tick();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(current.status).not.toBe("saved");
  await act(async () => finish(success("first")));
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: "second", expectedContentHash: hash("first") });
  expect(current.status).toBe("saved");
});

it("does not bypass the debounce when an earlier save completes while the user is still typing", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => current.onChange("first"));
  await tick();
  await act(async () => current.onChange("second"));
  await tick(1000);
  await act(async () => finish(success("first")));
  expect(current.status).toBe("pending");
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await tick(2000);
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

it("flushes the original file on navigation, retains in-flight edits on return, and isolates header status", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => current.onChange("edited"));
  await render("two.ts", "second file");
  expect(mocks.save).toHaveBeenCalledWith("project-one", { path: "one.ts", content: "edited", expectedContentHash: hash("original") });
  expect(current.status).toBe("saved");
  await render();
  expect(current.initialValue).toBe("edited");
  await act(async () => finish(success("edited")));
  expect(current.status).toBe("saved");
});

it("retains failed edits, exposes the error, and retries only on an explicit retry", async () => {
  mocks.save.mockResolvedValueOnce({ error: true, code: "FILE_CHANGED", message: "The file changed elsewhere." });
  await render();
  await act(async () => current.onChange("local"));
  await tick();
  expect(current.status).toBe("error");
  expect(current.message).toBe("The file changed elsewhere.");
  await tick(30000);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await render("two.ts");
  await render();
  expect(current.initialValue).toBe("local");
  await act(async () => current.retry());
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(current.status).toBe("saved");
});

it("does not let a pending debounce retry a request that failed during newer edits", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => current.onChange("first"));
  await tick();
  await act(async () => current.onChange("second"));
  await act(async () => finish({ error: true, message: "Connection failed." }));
  await tick();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(current.status).toBe("error");
  await act(async () => current.retry());
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: "second", expectedContentHash: hash("original") });
});

it.each([
  { submitted: "first", latest: "second" },
  { submitted: "first", latest: "original" },
  { submitted: "first", latest: "" },
  { submitted: "first", latest: "first" },
  { submitted: "", latest: "second" },
])("reconciles the lost response for '$submitted' before saving '$latest'", async ({ submitted, latest }) => {
  let disk = "original";
  let loseResponse = true;
  mocks.read.mockImplementation(async () => ({ path: "one.ts", content: disk, size: Buffer.byteLength(disk) }));
  mocks.save.mockImplementation(async (_project, input) => {
    if (input.expectedContentHash !== hash(disk) && input.content !== disk)
      return { error: true, code: "FILE_CHANGED", message: "Conflict." };
    disk = input.content;
    if (loseResponse) {
      loseResponse = false;
      throw new Error("Response lost after commit");
    }
    return success(disk);
  });
  await render();
  await act(async () => current.onChange(submitted));
  await tick();
  expect(current.status).toBe("error");
  expect(disk).toBe(submitted);
  await act(async () => current.onChange(latest));
  await act(async () => current.retry());
  expect(disk).toBe(latest);
  expect(current.status).toBe("saved");
  expect(mocks.read).toHaveBeenCalledWith("project-one", "one.ts");
  expect(client.getQueryData(["projects", "file", "user-one", "project-one", "one.ts"])).toMatchObject({ content: latest });
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: latest, expectedContentHash: hash(submitted) });
});

it("keeps genuine external changes and failed reconciliation from being overwritten", async () => {
  mocks.save.mockResolvedValueOnce({ error: true, message: "Response lost." });
  await render();
  await act(async () => current.onChange("local"));
  await tick();
  mocks.read.mockResolvedValueOnce(null);
  await act(async () => current.retry());
  expect(current.status).toBe("error");
  expect(mocks.save).toHaveBeenCalledTimes(1);
  mocks.read.mockResolvedValueOnce({ path: "one.ts", content: "external", size: 8 });
  await act(async () => current.retry());
  expect(current.status).toBe("error");
  expect(current.message).toMatch(/changed/i);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await render("two.ts");
  await render();
  expect(current.initialValue).toBe("local");
});

it("retains the reconciled baseline when the next save also fails", async () => {
  mocks.save.mockResolvedValue({ error: true, message: "Response lost." });
  await render();
  await act(async () => current.onChange("first"));
  await tick();
  mocks.read.mockResolvedValue({ path: "one.ts", content: "first", size: 5 });
  await act(async () => current.onChange("second"));
  await act(async () => current.retry());
  expect(current.status).toBe("error");
  mocks.save.mockImplementation(async (_project, input) => success(input.content));
  await act(async () => current.retry());
  expect(current.status).toBe("saved");
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: "second", expectedContentHash: hash("first") });
});

it("preserves edits made while reconciliation is in flight and waits for their debounce", async () => {
  mocks.save.mockResolvedValueOnce({ error: true, message: "Response lost." });
  await render();
  await act(async () => current.onChange("first"));
  await tick();
  let finish!: (value: unknown) => void;
  mocks.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => current.retry());
  expect(current.status).toBe("saving");
  await act(async () => current.onChange("newest"));
  await act(async () => finish({ path: "one.ts", content: "first", size: 5 }));
  expect(current.status).toBe("pending");
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: "first", expectedContentHash: hash("first") });
  await tick();
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: "newest", expectedContentHash: hash("first") });
  expect(current.status).toBe("saved");
});

it("skips edits undone before a write, but saves an undo made during a write", async () => {
  await render();
  await act(async () => { await current.onChange("edit"); await current.onChange("original"); });
  await tick();
  expect(mocks.save).not.toHaveBeenCalled();
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => current.onChange("edit"));
  await tick();
  await act(async () => current.onChange("original"));
  await tick();
  await act(async () => finish(success("edit")));
  expect(mocks.save).toHaveBeenLastCalledWith("project-one", { path: "one.ts", content: "original", expectedContentHash: hash("edit") });
});

it("isolates projects and new incarnations of a recreated path", async () => {
  await render();
  await act(async () => current.onChange("old draft"));
  await render("one.ts", "", 1);
  expect(current.initialValue).toBe("");
  expect(current.status).toBe("saved");
  await render("one.ts", "other project", 1, "project-two");
  expect(current.initialValue).toBe("other project");
});

it("keeps the document active when React checks initializers twice in Strict Mode", async () => {
  await act(async () => root.render(createElement(StrictMode, null,
    createElement(QueryClientProvider, { client },
      createElement(ProjectFileSaveRegistryProvider, { projectId: "project-one", children:
        createElement(ProjectFileSaveProvider, { filePath: "one.ts", version: 0, initialValue: "original", children: createElement(Probe) }),
      }),
    ),
  )));
  const previous = registry.getDocument("one.ts", 0, "original");
  await act(async () => current.onChange("edited"));
  await tick();
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(current.status).toBe("saved");
  expect(registry.getDocument("one.ts", 0, "edited")).toBe(previous);
});


it.each([true, false])("invalidates only this account and project's changes after a confirmed save (active: %s)", async (active) => {
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
    mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render();
    await act(async () => current.onChange("edited"));
    await tick();
    expect(current.status).toBe("saving");
    expect(fetchChanges).not.toHaveBeenCalled();
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    await act(async () => finish(success("edited")));
    await tick(1);
    expect(current.status).toBe("saved");
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

it("does not invalidate changes for failed saves", async () => {
  const key = ["projects", "changes", "user-one", "project-one"];
  client.setQueryData(key, { revision: "before" });
  mocks.save.mockResolvedValueOnce({ error: true, message: "Save failed." });
  await render();
  await act(async () => current.onChange("edited"));
  await tick();
  expect(current.status).toBe("error");
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
});

it("drains saves before Git and preserves late editor drafts across the refreshed document", async () => {
  await render();
  await act(async () => current.onChange("before Git"));
  let finish!: () => void;
  let pending!: Promise<void>;
  const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  await act(async () => { pending = registry.withSavedFiles(action); });
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(action).toHaveBeenCalledOnce();
  await act(async () => current.onChange("late editor draft"));
  await tick();
  expect(mocks.save).toHaveBeenCalledOnce();
  await act(async () => { finish(); await pending; });
  await render("one.ts", "server changed by Git", 1);
  expect(current.initialValue).toBe("late editor draft");
  expect(current.status).toBe("pending");
});

it("does not run Git when a preceding save fails and releases its pause", async () => {
  await render();
  await act(async () => current.onChange("draft"));
  mocks.save.mockResolvedValueOnce({ error: true, message: "Save failed" });
  const action = vi.fn();
  await act(async () => { await expect(registry.withSavedFiles(action)).rejects.toThrow("Save failed"); });
  expect(action).not.toHaveBeenCalled();
  expect(registry.getDocument("one.ts", 0, "original").isPaused()).toBe(false);
});

it("blocks renames and dependent flushes while Git holds the documents", async () => {
  await render();
  let finish!: () => void;
  let pending!: Promise<void>;
  await act(async () => { pending = registry.withSavedFiles(() => new Promise<void>((resolve) => { finish = resolve; })); });
  await expect(registry.renameFiles("one.ts", "other.ts", vi.fn())).rejects.toThrow("Git");
  await expect(registry.flushPendingSaves()).rejects.toThrow("Git");
  await act(async () => { finish(); await pending; });
});


let editorDocuments: ReturnType<typeof useProjectEditorDocuments>;
const EditorProbe = ({ path, content, paths }: { path: string; content: string; paths: string[] }) => {
  editorDocuments = useProjectEditorDocuments({ activeFilePath: path, openFilePaths: new Set(paths), getFileVersion: () => 0 }, content);
  registry = useProjectFileSaveRegistry();
  return null;
};
const renderEditor = (path: string, content = "original", paths = ["one.ts", "two.ts"]) => act(async () => root.render(
  createElement(QueryClientProvider, { client }, createElement(ProjectFileSaveRegistryProvider, { projectId: "project-one", children:
    createElement(EditorProbe, { path, content, paths }),
  })),
));

it("retains each open document and routes late bridge edits to their source", async () => {
  await renderEditor("one.ts");
  const first = editorDocuments.editor!.key;
  await act(async () => editorDocuments.onChange("first draft", first));
  await renderEditor("two.ts", "second file");
  const second = editorDocuments.editor!.key;
  await act(async () => editorDocuments.onChange("late first draft", first));
  expect(editorDocuments.status.status).toBe("saved");
  await tick();
  expect(mocks.save.mock.calls.every((call) => call[1].path === "one.ts")).toBe(true);
  await renderEditor("one.ts", "late first draft");
  expect(editorDocuments.editor!.key).toBe(first);
  await renderEditor("two.ts", "second file");
  expect(editorDocuments.editor!.key).toBe(second);
});

it("flushes a closing file and refuses to hide a failed save", async () => {
  await renderEditor("one.ts");
  await act(async () => editorDocuments.onChange("draft", editorDocuments.editor!.key));
  mocks.save.mockResolvedValueOnce({ error: true, message: "Cannot save" });
  await act(async () => { await expect(editorDocuments.flushFile("one.ts")).rejects.toThrow("Cannot save"); });
  expect(editorDocuments.status.status).toBe("error");
  await act(async () => editorDocuments.retry());
  await act(async () => { await expect(editorDocuments.flushFile("one.ts")).resolves.toBeUndefined(); });
});

it("does not replace a local draft when server content refreshes", async () => {
  await renderEditor("one.ts");
  const first = editorDocuments.editor!.key;
  await act(async () => editorDocuments.onChange("local draft", first));
  await renderEditor("one.ts", "external change");
  expect(editorDocuments.editor!.key).toBe(first);
  expect(registry.getDocument("one.ts", 0, "external change").getContent()).toBe("local draft");
});


it("invalidates deleted documents so delayed edits cannot recreate them", async () => {
  await renderEditor("one.ts");
  const key = editorDocuments.editor!.key;
  await act(async () => { registry.invalidateFiles("one.ts"); await editorDocuments.onChange("late edit", key); });
  await tick();
  expect(mocks.save).not.toHaveBeenCalled();
});
