// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectFileSaveRegistryProvider, ProjectFileSaveProvider, useProjectFileSave } from "@/features/projects/hooks/use-project-file-save";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/features/projects/actions/file-actions", () => ({ saveProjectFileContentAction: mocks.save }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => ({ isPending: false, data: { user: { id: "user-one" } } }) }));
const hash = (content: string) => createHash("sha256").update(content).digest("hex");
const success = (content: string, path = "one.ts") => ({ error: false, message: "Saved.", data: { path, size: Buffer.byteLength(content), contentHash: hash(content) } });
let current: NonNullable<ReturnType<typeof useProjectFileSave>>;
const Probe = () => { current = useProjectFileSave()!; return null; };
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
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.useRealTimers(); });

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
  await act(async () => current.onChange("edited"));
  await tick();
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(current.status).toBe("saved");
});
