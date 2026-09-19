// @vitest-environment happy-dom
import { act, createElement, Fragment, useEffect, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProjectLayout, { unstable_settings as projectSettings } from "@/app/projects/[projectId]/_layout";
import ProjectScreen from "@/app/projects/[projectId]/index";
import FilesScreen from "@/app/projects/[projectId]/files";
import CodeScreen from "@/app/projects/[projectId]/code";
import { useProjectWorkspaceFileCreation } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import type { ProjectFilesList } from "@/features/projects/components/project-files-list";
import type { ProjectFileCreateRow } from "@/features/projects/components/project-file-create-row";
import type { Tabs, TabSlot } from "expo-router/ui";

vi.mock("react-native-reanimated", () => {
  const transition = { duration: () => transition, reduceMotion: () => transition };
  return {
    default: { View: ({ children }: { children?: ReactNode }) => createElement("div", null, children) },
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
  };
});
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));

const mocks = vi.hoisted(() => ({ projectId: "project-one", readContent: vi.fn(), save: vi.fn(), change: undefined as ((value: string) => Promise<void>) | undefined, create: vi.fn(), update: vi.fn(), delete: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn());
const lifecycle = vi.hoisted(() => ({ listeners: new Set<(state: string) => void>() }));
vi.mock("@/features/projects/components/project-file-entrance", () => ({ ProjectFileEntrance: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("expo-router", () => ({ Redirect: ({ href }: { href: unknown }) => { redirect(href); return null; }, useSegments: () => ["projects", "[projectId]", "files"], useLocalSearchParams: () => ({ projectId: mocks.projectId }), useRouter: () => ({ navigate: vi.fn() }) }));
const Children = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
const SelectionProbe = () => {
  selection = useProjectWorkspaceCurrentFile();
  creation = useProjectWorkspaceFileCreation();
  return null;
};
let tabOptions: ComponentProps<typeof Tabs>["options"];
let detachInactiveScreens: ComponentProps<typeof TabSlot>["detachInactiveScreens"];
vi.mock("expo-router/ui", () => ({
  Tabs: (props: ComponentProps<typeof Tabs>) => { tabOptions = props.options; return createElement(Children, props); },
  TabList: () => null,
  TabTrigger: () => null,
  TabSlot: (props: ComponentProps<typeof TabSlot>) => { detachInactiveScreens = props.detachInactiveScreens; return createElement(Fragment, null, createElement(SelectionProbe), createElement(FilesScreen), createElement(CodeScreen)); },
}));
vi.mock("@/features/projects/components/project-setup-gate", () => ({ ProjectSetupGate: (props: { children?: ReactNode }) => createElement(Children, props) }));
vi.mock("@/features/projects/components/project-workspace-dock", () => ({ ProjectWorkspaceDock: () => null }));
vi.mock("@/features/projects/components/project-files-list", () => ({ ProjectFilesList: (props: ComponentProps<typeof ProjectFilesList>) => { fileList = props; return null; } }));
vi.mock("@/features/projects/components/project-file-create-row", () => ({ ProjectFileCreateRow: (props: ComponentProps<typeof ProjectFileCreateRow>) => { createRow = props; return null; } }));
vi.mock("@/features/projects/components/project-workspace-state", () => ({ ProjectWorkspaceState: ({ title }: { title: string }) => createElement("span", null, title) }));
vi.mock("@/features/projects/actions/file-actions", () => ({
  readProjectFilesAction: async () => [], readProjectFileContentAction: mocks.readContent,
  createProjectFileAction: mocks.create, updateProjectFileAction: mocks.update, deleteProjectFileAction: mocks.delete,
  saveProjectFileContentAction: mocks.save,
}));
vi.mock("@/hooks/use-success-feedback", () => ({ useSuccessFeedback: () => vi.fn() }));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/features/projects/actions/code-intelligence-actions", () => ({ readProjectCodeIntelligence: vi.fn() }));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ isDarkMode: false }) }));
vi.mock("@/hooks/use-editor-development-shortcuts", () => ({ useEditorDevelopmentShortcuts: () => {} }));
vi.mock("@/features/projects/components/project-code-tabs", () => ({ ProjectCodeTabs: ({ paths, onSelect }: { paths: string[]; onSelect: (path: string) => void }) => createElement("div", null, paths.map((path) => createElement("button", { key: path, onClick: () => onSelect(path) }, path))) }));
vi.mock("@/features/projects/components/project-code-tools", () => ({ ProjectCodeTools: () => null }));
vi.mock("@/components/code-editor", () => ({ default: ({ initialValue, documentKey, onReady, onChange }: { documentKey: string; initialValue: string; onReady: (key?: string) => Promise<void>; onChange: (value: string) => Promise<void> }) => {
  mocks.change = onChange;
  useEffect(() => { void onReady(documentKey); }, [onReady, documentKey]);
  return createElement("textarea", { key: documentKey, defaultValue: initialValue });
} }));
vi.mock("@/components/code-editor-loading", () => ({ CodeEditorLoading: () => createElement("span", null, "Loading editor") }));
vi.mock("@/components/ui/text", () => {
  const Text = (props: { children?: ReactNode }) => createElement(Children, props);
  return { PText: Text, HeadingText: Text, CodeText: Text };
});
vi.mock("@/components/ui/button", () => ({ Button: (props: { children?: ReactNode }) => createElement(Children, props) }));
vi.mock("react-native", () => ({ AppState: { addEventListener: (_event: string, listener: (state: string) => void) => {
  lifecycle.listeners.add(listener);
  return { remove: () => lifecycle.listeners.delete(listener) };
} }, View: (props: { children?: ReactNode }) => createElement(Children, props), Pressable: (props: { children?: ReactNode }) => createElement(Children, props), ActivityIndicator: () => null, Alert: { alert: vi.fn() } }));

let selection: ReturnType<typeof useProjectWorkspaceCurrentFile>;
let creation: ReturnType<typeof useProjectWorkspaceFileCreation>;
let fileList: ComponentProps<typeof ProjectFilesList>;
let createRow: ComponentProps<typeof ProjectFileCreateRow>;
let client: QueryClient;
let container: HTMLDivElement;
let root: Root;
const flush = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
};
const render = async () => {
  await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(ProjectLayout))); });
  await flush();
};
const select = async (path: string) => {
  act(() => selection.openFile(path));
  await flush();
};
const result = (path: string, isDir = false) => ({ error: false, message: "Done.", data: { name: path.split("/").at(-1)!, path, isDir, size: 0 } });

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.projectId = "project-one";
  mocks.readContent.mockReset().mockImplementation(async (_project: string, path: string) => ({ path, content: "server contents", size: 15 }));
  mocks.update.mockReset(); mocks.delete.mockReset(); mocks.create.mockReset();
  mocks.save.mockReset().mockImplementation(async (_project, input) => ({ error: false, message: "Saved.", data: { path: input.path, size: Buffer.byteLength(input.content), contentHash: createHash("sha256").update(input.content).digest("hex") } }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  root = createRoot(container);
  await render();
});
afterEach(() => { act(() => root.unmount()); client.clear(); });

it("retains native screen containment and default lazy navigation without reading an unselected file", () => {
  expect(tabOptions?.screenOptions).toBeUndefined();
  expect(detachInactiveScreens).toBe(true);
  expect(mocks.readContent).not.toHaveBeenCalled();
});

it("opens projects in Code and makes it the system-back destination for supporting screens", () => {
  expect(projectSettings.initialRouteName).toBe("code");
  expect(tabOptions?.backBehavior).toBe("initialRoute");
  act(() => root.render(createElement(ProjectScreen)));
  expect(redirect).toHaveBeenLastCalledWith({ pathname: "/projects/[projectId]/code", params: { projectId: mocks.projectId } });
});

it("waits for pending and subsequently queued edits before renaming", async () => {
  await select("old.ts");
  const save = mocks.save.getMockImplementation()!;
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  mocks.save.mockImplementationOnce((...args) => new Promise((resolve) => { finishFirst = () => resolve(save(...args)); }))
    .mockImplementationOnce((...args) => new Promise((resolve) => { finishSecond = () => resolve(save(...args)); }));
  mocks.update.mockResolvedValueOnce(result("new.ts"));
  await act(async () => mocks.change!("first"));
  let pending!: Promise<void>;
  await act(async () => { pending = fileList.onUpdate({ parentPath: "", previousName: "old.ts", name: "new.ts", kind: "file" }); });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async () => mocks.change!("second"));
  await act(async () => finishFirst());
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.update).not.toHaveBeenCalled();
  await act(async () => { finishSecond(); await pending; });
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(selection.activeFilePath).toBe("new.ts");
});

it("keeps the path and draft when a save fails before rename", async () => {
  await select("old.ts");
  mocks.save.mockResolvedValue({ error: true, message: "Unable to save draft." });
  mocks.update.mockResolvedValueOnce(result("new.ts"));
  await act(async () => mocks.change!("draft"));
  await act(async () => {
    await expect(fileList.onUpdate({ parentPath: "", previousName: "old.ts", name: "new.ts", kind: "file" })).rejects.toThrow("Unable to save draft.");
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(selection.activeFilePath).toBe("old.ts");
  await select("other.ts");
  await select("old.ts");
  expect(container.querySelector("textarea")?.value).toBe("draft");
});

it("waits for every dirty descendant before renaming a folder", async () => {
  const save = mocks.save.getMockImplementation()!;
  const finishes = new Map<string, () => void>();
  mocks.save.mockImplementation((...args) => new Promise((resolve) => { finishes.set(args[1].path, () => resolve(save(...args))); }));
  mocks.update.mockResolvedValueOnce(result("lib", true));
  await select("src/first.ts");
  await act(async () => mocks.change!("first draft"));
  await select("src/second.ts");
  await act(async () => mocks.change!("second draft"));
  let pending!: Promise<void>;
  await act(async () => { pending = fileList.onUpdate({ parentPath: "", previousName: "src", name: "lib", kind: "folder" }); });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(finishes.size).toBe(2);
  await act(async () => finishes.get("src/second.ts")!());
  expect(mocks.update).not.toHaveBeenCalled();
  await act(async () => { finishes.get("src/first.ts")!(); await pending; });
  expect(selection.activeFilePath).toBe("lib/second.ts");
  expect(mocks.update).toHaveBeenCalledOnce();
});

it("retains late edits during rename and saves them only at the new path", async () => {
  await select("old.ts");
  let finish!: (value: unknown) => void;
  mocks.update.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = fileList.onUpdate({ parentPath: "", previousName: "old.ts", name: "new.ts", kind: "file" }); });
  await act(async () => mocks.change!("late draft"));
  await act(async () => lifecycle.listeners.forEach((listener) => listener("background")));
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => { finish(result("new.ts")); await pending; });
  await flush();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("project-one", { path: "new.ts", content: "late draft", expectedContentHash: createHash("sha256").update("server contents").digest("hex") });
  expect(container.querySelector("textarea")?.value).toBe("late draft");
});

it("retargets drafts opened while a folder rename is in progress", async () => {
  await select("src/first.ts");
  let finish!: (value: unknown) => void;
  mocks.update.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = fileList.onUpdate({ parentPath: "", previousName: "src", name: "lib", kind: "folder" }); });
  await select("src/second.ts");
  await act(async () => mocks.change!("new draft"));
  await act(async () => lifecycle.listeners.forEach((listener) => listener("background")));
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => { finish(result("lib", true)); await pending; });
  await flush();
  expect(selection.activeFilePath).toBe("lib/second.ts");
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("project-one", { path: "lib/second.ts", content: "new draft", expectedContentHash: createHash("sha256").update("server contents").digest("hex") });
  expect(container.querySelector("textarea")?.value).toBe("new draft");
});

it("keeps the rename pause until all descendant saves settle after one fails", async () => {
  const save = mocks.save.getMockImplementation()!;
  let finish!: () => void;
  mocks.save.mockImplementation((...args) => args[1].path === "src/first.ts"
    ? Promise.resolve({ error: true, message: "Save failed." })
    : new Promise((resolve) => { finish = () => resolve(save(...args)); }));
  await select("src/first.ts");
  await act(async () => mocks.change!("first draft"));
  await select("src/second.ts");
  await act(async () => mocks.change!("second draft"));
  let settled = false;
  let pending!: Promise<void>;
  await act(async () => { pending = fileList.onUpdate({ parentPath: "", previousName: "src", name: "lib", kind: "folder" }).catch(() => { settled = true; }); });
  expect(settled).toBe(false);
  expect(mocks.update).not.toHaveBeenCalled();
  await act(async () => { finish(); await pending; });
  expect(settled).toBe(true);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects a second rename while saves for the first one are pending", async () => {
  await select("old.ts");
  const save = mocks.save.getMockImplementation()!;
  let finish!: () => void;
  mocks.save.mockImplementationOnce((...args) => new Promise((resolve) => { finish = () => resolve(save(...args)); }));
  mocks.update.mockResolvedValueOnce(result("new.ts"));
  await act(async () => mocks.change!("draft"));
  let pending!: Promise<void>;
  await act(async () => { pending = fileList.onUpdate({ parentPath: "", previousName: "old.ts", name: "new.ts", kind: "file" }); });
  await act(async () => {
    await expect(fileList.onUpdate({ parentPath: "", previousName: "old.ts", name: "other.ts", kind: "file" })).rejects.toThrow(/rename.*progress/i);
  });
  await act(async () => { finish(); await pending; });
  expect(mocks.update).toHaveBeenCalledOnce();
});

it("resumes late edits at the original path after a failed rename", async () => {
  await select("old.ts");
  let finish!: (value: unknown) => void;
  mocks.update.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = fileList.onUpdate({ parentPath: "", previousName: "old.ts", name: "new.ts", kind: "file" }); });
  await act(async () => mocks.change!("late draft"));
  await act(async () => {
    finish({ error: true, message: "Rename failed." });
    await expect(pending).rejects.toThrow("Rename failed.");
  });
  expect(selection.activeFilePath).toBe("old.ts");
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith("project-one", { path: "old.ts", content: "late draft", expectedContentHash: createHash("sha256").update("server contents").digest("hex") });
});

it.each([
  { selected: "old.ts", source: "old.ts", destination: "new.ts", expected: "new.ts", kind: "file" as const },
  { selected: "src/nested/main.ts", source: "src", destination: "lib", expected: "lib/nested/main.ts", kind: "folder" as const },
  { selected: "src-other/main.ts", source: "src", destination: "lib", expected: "src-other/main.ts", kind: "folder" as const },
])("retargets $selected only when it belongs to the renamed $source", async ({ selected, source, destination, expected, kind }) => {
  await select(selected);
  client.setQueryData(["projects", "file", "project-one", expected], { path: expected, content: "obsolete destination", size: 20 });
  mocks.update.mockResolvedValueOnce(result(destination, kind === "folder"));
  await act(async () => { await fileList.onUpdate({ parentPath: "", previousName: source, name: destination, kind }); });
  await flush();
  expect(selection.activeFilePath).toBe(expected);
  expect(container.querySelector("textarea")?.value).toBe("server contents");
  const segments = expected.split("/");
  expect(container.textContent).toContain(segments.pop());
  if (segments.length > 0) expect(container.textContent).toContain(segments.join("/"));
});

it.each([
  { selected: "old.ts", deleted: "old.ts", kind: "file" as const, expected: null },
  { selected: "src/nested/main.ts", deleted: "src", kind: "folder" as const, expected: null },
  { selected: "src-other/main.ts", deleted: "src", kind: "folder" as const, expected: "src-other/main.ts" },
])("clears $selected only when it belongs to the deleted $deleted", async ({ selected, deleted, kind, expected }) => {
  await select(selected);
  mocks.delete.mockResolvedValueOnce(result(deleted, kind === "folder"));
  await act(async () => { await fileList.onDelete({ parentPath: "", name: deleted, kind }); });
  await flush();
  expect(selection.activeFilePath).toBe(expected);
  if (expected === null) {
    // The WebView remains mounted but hidden when the final tab closes.
    expect(container.textContent).toContain("No file selected");
  } else expect(container.querySelector("textarea")?.value).toBe("server contents");
});

it.each(["rename", "delete"])("preserves a newer selection while a %s is pending", async (operation) => {
  await select("old.ts");
  let finish!: (value: unknown) => void;
  const action = operation === "rename" ? mocks.update : mocks.delete;
  action.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => {
    pending = operation === "rename"
      ? fileList.onUpdate({ parentPath: "", previousName: "old.ts", name: "new.ts", kind: "file" })
      : fileList.onDelete({ parentPath: "", name: "old.ts", kind: "file" });
  });
  expect(selection.activeFilePath).toBe("old.ts");
  await select("other.ts");
  await act(async () => { finish(result(operation === "rename" ? "new.ts" : "old.ts")); await pending; });
  expect(selection.activeFilePath).toBe("other.ts");
});

it.each(["rename", "delete"])("updates the latest affected descendant while a folder %s is pending", async (operation) => {
  await select("src/first.ts");
  let finish!: (value: unknown) => void;
  (operation === "rename" ? mocks.update : mocks.delete).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => {
    pending = operation === "rename"
      ? fileList.onUpdate({ parentPath: "", previousName: "src", name: "lib", kind: "folder" })
      : fileList.onDelete({ parentPath: "", name: "src", kind: "folder" });
  });
  await select("src/second.ts");
  await act(async () => { finish(result(operation === "rename" ? "lib" : "src", true)); await pending; });
  await flush();
  expect(selection.activeFilePath).toBe(operation === "rename" ? "lib/second.ts" : null);
});

it.each(["rename", "delete"])("preserves selection and local edits after a failed %s", async (operation) => {
  await select("old.ts");
  container.querySelector("textarea")!.value = "unsaved edits";
  (operation === "rename" ? mocks.update : mocks.delete).mockResolvedValueOnce({ error: true, message: "Failed." });
  await act(async () => {
    if (operation === "rename") await expect(fileList.onUpdate({ parentPath: "", previousName: "old.ts", name: "new.ts", kind: "file" })).rejects.toThrow("Failed.");
    else await fileList.onDelete({ parentPath: "", name: "old.ts", kind: "file" });
  });
  expect(selection.activeFilePath).toBe("old.ts");
  expect(container.querySelector("textarea")?.value).toBe("unsaved edits");
});

it("does not let an earlier project's completion change the new project's selection", async () => {
  await select("old.ts");
  let finish!: (value: unknown) => void;
  mocks.delete.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = fileList.onDelete({ parentPath: "", name: "old.ts", kind: "file" }); });
  mocks.projectId = "project-two";
  await render();
  await select("old.ts");
  await act(async () => { finish(result("old.ts")); await pending; });
  expect(selection.activeFilePath).toBe("old.ts");
  expect(container.querySelector("textarea")?.value).toBe("server contents");
});

it.each([0, 6_000])("loads fresh contents when a deleted path is recreated after %s ms", async (age) => {
  await select("old.ts");
  mocks.delete.mockResolvedValueOnce(result("old.ts"));
  await act(async () => { await fileList.onDelete({ parentPath: "", name: "old.ts", kind: "file" }); });
  await flush();
  // Also cover stale contents left by a previously opened incarnation of this path.
  client.setQueryData(["projects", "file", "project-one", "old.ts"], { path: "old.ts", content: "obsolete", size: 8 }, { updatedAt: Date.now() - age });
  act(() => creation.begin("file"));
  mocks.create.mockResolvedValueOnce(result("old.ts"));
  mocks.readContent.mockImplementation(async (_project: string, path: string) => ({ path, content: "", size: 0 }));
  await act(async () => { await createRow.onCreate({ parentPath: "", name: "old.ts", kind: "file" }); });
  await select("old.ts");
  expect(container.querySelector("textarea")?.value).toBe("");
});

it("refreshes an actively selected path recreated after an external deletion", async () => {
  await select("old.ts");
  expect(container.querySelector("textarea")?.value).toBe("server contents");
  act(() => creation.begin("file"));
  mocks.create.mockResolvedValueOnce(result("old.ts"));
  mocks.readContent.mockImplementation(async (_project: string, path: string) => ({ path, content: "", size: 0 }));
  await act(async () => { await createRow.onCreate({ parentPath: "", name: "old.ts", kind: "file" }); });
  await flush();
  expect(selection.activeFilePath).toBe("old.ts");
  expect(container.querySelector("textarea")?.value).toBe("");
});


it("keeps all tabs in sync when an inactive folder is renamed then deleted", async () => {
  await select("src/one.ts");
  await select("src/two.ts");
  await select("other.ts");
  mocks.update.mockResolvedValueOnce(result("lib", true));
  await act(async () => { await fileList.onUpdate({ parentPath: "", previousName: "src", name: "lib", kind: "folder" }); });
  expect([...selection.openFilePaths]).toEqual(["lib/one.ts", "lib/two.ts", "other.ts"]);
  expect(selection.activeFilePath).toBe("other.ts");
  mocks.delete.mockResolvedValueOnce(result("lib", true));
  await act(async () => { await fileList.onDelete({ parentPath: "", name: "lib", kind: "folder" }); });
  expect([...selection.openFilePaths]).toEqual(["other.ts"]);
});


it("drains edits before deletion and ignores late edits after confirmed deletion", async () => {
  await select("old.ts");
  const lateChange = mocks.change!;
  await act(async () => lateChange("draft"));
  let finish!: () => void;
  mocks.save.mockImplementationOnce((_project, input) => new Promise((resolve) => { finish = () => resolve({ error: false, message: "Saved", data: { path: input.path, size: 5, contentHash: createHash("sha256").update(input.content).digest("hex") } }); }));
  mocks.delete.mockResolvedValueOnce(result("old.ts"));
  let deletion!: Promise<void>;
  await act(async () => { deletion = fileList.onDelete({ parentPath: "", name: "old.ts", kind: "file" }); });
  expect(mocks.delete).not.toHaveBeenCalled();
  await act(async () => { finish(); await deletion; });
  expect([...selection.openFilePaths]).toEqual([]);
  await act(async () => lateChange("late"));
  expect(mocks.save).toHaveBeenCalledOnce();
});
