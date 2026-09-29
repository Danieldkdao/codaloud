// @vitest-environment happy-dom
import { act, useImperativeHandle, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FilePreviewScreen from "@/app/projects/[projectId]/files/preview";
import type CodeEditor from "@/components/code-editor";
vi.mock("@/features/projects/components/project-image-preview-content", () => ({
  ProjectImagePreviewContent: () => null,
}));

const mocks = vi.hoisted(() => ({
  params: { projectId: "project-one", filePath: "src/My File [id].tsx" } as { projectId: string; filePath?: string | string[]; search?: string | string[] },
  nextMatch: vi.fn(), previousMatch: vi.fn(), dismissTo: vi.fn(), navigate: vi.fn(), selectFile: vi.fn(), read: vi.fn(), editor: vi.fn(), isDarkMode: false,
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => mocks.params, useRouter: () => ({ dismissTo: mocks.dismissTo, navigate: mocks.navigate }) }));
vi.mock("../hooks/use-project-workspace-current-file", () => ({ useProjectWorkspaceCurrentFile: () => ({ openFile: mocks.selectFile }) }));
vi.mock("../actions/file-actions", () => ({ readProjectFileContentAction: mocks.read }));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ isDarkMode: mocks.isDarkMode }), useThemeColor: () => "transparent" }));
vi.mock("@/components/code-editor", () => ({ default: (props: ComponentProps<typeof CodeEditor>) => {
  useImperativeHandle(props.ref, () => ({ focus: vi.fn(), captureContext: () => {}, previewSuggestion: () => {}, acceptSuggestion: () => {}, revealDiagnostic: () => {}, transform: () => {}, searchCommand: () => {}, command: async () => {}, flushChanges: async () => {}, dismissKeyboard: vi.fn(), nextMatch: mocks.nextMatch, previousMatch: mocks.previousMatch }));
  mocks.editor(props);
  return <div data-testid="editor">{props.initialValue}</div>;
} }));
vi.mock("@/components/code-editor-loading", () => ({ CodeEditorLoading: () => <div role="progressbar">Initializing your editor</div> }));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/app-wrapper", () => ({ AppWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ActivityIndicator: ({ accessibilityLabel }: { accessibilityLabel?: string }) => <span role="progressbar" aria-label={accessibilityLabel} />,
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  HeadingText: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onPress, accessibilityLabel, disabled }: {
  children: ReactNode; onPress: () => void; accessibilityLabel?: string; disabled?: boolean;
}) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button> }));
vi.mock("../hooks/use-project-workspace-dock-height", () => ({ useProjectWorkspaceDockHeight: () => ({ dockHeight: 80 }) }));

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(2); }); };
const render = async () => {
  await act(async () => root.render(<QueryClientProvider client={client}><FilePreviewScreen /></QueryClientProvider>));
  await flush();
};
const editorProps = () => mocks.editor.mock.lastCall![0] as ComponentProps<typeof CodeEditor>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.params = { projectId: "project-one", filePath: "src/My File [id].tsx" };
  mocks.dismissTo.mockClear(); mocks.editor.mockClear(); mocks.isDarkMode = false;
  mocks.nextMatch.mockClear(); mocks.previousMatch.mockClear();
  mocks.navigate.mockClear(); mocks.selectFile.mockClear();
  mocks.read.mockReset().mockResolvedValue({ path: mocks.params.filePath, content: "export const answer = 42;", size: 24 });
  client = new QueryClient();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); client.clear(); onlineManager.setOnline(true);
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it("fetches the selected file through the shared hook and renders a read-only editor", async () => {
  await render();
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith("project-one", mocks.params.filePath, expect.any(AbortSignal), expect.any(Function));
  expect(container.textContent).toContain("src/My File [id].tsx");
  expect(container.textContent).not.toContain("Project ID");
  expect(editorProps()).toMatchObject({ filename: mocks.params.filePath, initialValue: "export const answer = 42;", readOnly: true, colorScheme: "light" });
  expect(editorProps().onChange).toBeUndefined();
  expect(editorProps().onRequestAnalysis).toBeUndefined();
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  await act(async () => editorProps().onReady?.());
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Back to files"]')!.click());
  expect(mocks.dismissTo).toHaveBeenCalledExactlyOnceWith({ pathname: "/projects/[projectId]/files", params: { projectId: "project-one" } });
});

it("refreshes recently cached content on every preview mount and replaces it with confirmed bytes", async () => {
  const cached = { path: mocks.params.filePath, content: "old bytes", size: 9 };
  client.setQueryData(["projects", "file", "project-one", mocks.params.filePath], cached);
  let finish!: (value: unknown) => void;
  mocks.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(editorProps().initialValue).toBe("old bytes");
  expect(container.querySelector('[aria-label="Refreshing file"]')).not.toBeNull();
  await act(async () => finish({ ...cached, content: "new bytes" }));
  await flush();
  expect(editorProps()).toMatchObject({ initialValue: "new bytes", readOnly: true });
  expect(container.textContent).not.toContain("old bytes");
  expect(container.querySelector('[aria-label="Refreshing file"]')).toBeNull();
  await act(async () => root.render(null));
  mocks.read.mockResolvedValueOnce({ ...cached, content: "newer bytes", size: 11 });
  await render();
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(editorProps().initialValue).toBe("newer bytes");
});

it.each(["FILE_NOT_FOUND", undefined])("shows a failed fresh read instead of presenting cached content (%s)", async (code) => {
  client.setQueryData(["projects", "file", "project-one", mocks.params.filePath], {
    path: mocks.params.filePath, content: "cached bytes", size: 12,
  });
  mocks.read.mockImplementationOnce(async (_project, _path, _signal, onFailure) => {
    if (code) onFailure({ error: true, code, message: "This file no longer exists." }, null);
    return null;
  });
  await render();
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Couldn't open this file");
  expect(container.textContent).not.toContain("cached bytes");
  expect(container.querySelector('[data-testid="editor"]')).toBeNull();
  expect(container.querySelector('[aria-label="Open in editor"]')).toBeNull();
  if (code) expect(container.textContent).toContain("This file no longer exists.");
  const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Try again")!;
  await act(async () => retry.click());
  await flush();
  expect(editorProps().initialValue).toBe("export const answer = 42;");
});

it("refreshes cached previews from the device while offline", async () => {
  client.setQueryData(["projects", "file", "project-one", mocks.params.filePath], {
    path: mocks.params.filePath, content: "cached bytes", size: 12,
  });
  onlineManager.setOnline(false);
  await render();
  expect(container.textContent).not.toContain("Reconnect to the internet");
  expect(container.querySelector('[data-testid="editor"]')).not.toBeNull();
  expect(mocks.read).toHaveBeenCalledOnce();
  await act(async () => onlineManager.setOnline(true));
  await flush();
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(editorProps().initialValue).toBe("export const answer = 42;");
});

it("opens the previewed file in Code only when the floating action is pressed", async () => {
  await render();
  expect(mocks.selectFile).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "Open in editor");
  expect(button).toBeDefined();
  expect(editorProps().bottomInset).toBeGreaterThan(80);
  act(() => button!.click());
  expect(mocks.selectFile).toHaveBeenCalledExactlyOnceWith("src/My File [id].tsx");
  expect(mocks.dismissTo).toHaveBeenCalledExactlyOnceWith({ pathname: "/projects/[projectId]/code", params: { projectId: "project-one" } });
});

it("shows loading while fetching and opens an empty file successfully", async () => {
  let resolve!: (value: unknown) => void;
  mocks.read.mockImplementation(() => new Promise((done) => { resolve = done; }));
  await render();
  expect(mocks.editor).not.toHaveBeenCalled();
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Open in editor");
  await act(async () => resolve({ path: mocks.params.filePath, content: "", size: 0 }));
  await flush();
  expect(editorProps().initialValue).toBe("");
});

it("offers retry on a failed read", async () => {
  mocks.read.mockResolvedValueOnce(null);
  await render();
  expect(container.textContent).toContain("Couldn't open this file");
  expect(container.textContent).not.toContain("Open in editor");
  expect(mocks.editor).not.toHaveBeenCalled();
  const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Try again")!;
  act(() => retry.click());
  await flush();
  expect(editorProps().initialValue).toBe("export const answer = 42;");
});

it.each([{ filePath: undefined }, { filePath: "../outside.ts" }, { filePath: ["one.ts", "two.ts"] }])("does not fetch a missing or invalid path: $filePath", async ({ filePath }) => {
  mocks.params.filePath = filePath;
  await render();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.editor).not.toHaveBeenCalled();
  expect(container.textContent).toContain("No file selected");
  expect(container.textContent).not.toContain("Open in editor");
  expect(container.querySelector('[aria-label="Back to files"]')).not.toBeNull();
});

it("replaces the previous preview when the selected path changes", async () => {
  await render();
  mocks.params.filePath = "src/other.ts";
  mocks.read.mockImplementation(() => new Promise(() => {}));
  await render();
  expect(container.querySelector('[data-testid="editor"]')).toBeNull();
  expect(container.textContent).not.toContain("export const answer");
});

it("opens an uncached local file while offline", async () => {
  onlineManager.setOnline(false);
  await render();
  expect(container.textContent).not.toContain("Reconnect to the internet");
  expect(mocks.read).toHaveBeenCalledOnce();
});


it("passes the search term to the editor and navigates from the floating match controls", async () => {
  mocks.params.search = "answer";
  await render();
  expect(editorProps().matches).toEqual(["answer"]);
  const next = () => container.querySelector<HTMLButtonElement>('[aria-label="Next match"]')!;
  expect(next().disabled).toBe(true);
  await act(async () => editorProps().onMatchesChange?.({ total: 12, activeIndex: 0 }));
  expect(next().disabled).toBe(true);
  await act(async () => editorProps().onReady?.());
  expect(container.textContent).toContain("1 / 12");
  expect(next().disabled).toBe(false);
  act(() => next().click());
  expect(mocks.nextMatch).toHaveBeenCalledOnce();
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Previous match"]')!.click());
  expect(mocks.previousMatch).toHaveBeenCalledOnce();
  await act(async () => editorProps().onMatchesChange?.({ total: 12, activeIndex: 1 }));
  expect(container.textContent).toContain("2 / 12");
  expect(mocks.selectFile).not.toHaveBeenCalled();
  expect(mocks.read).toHaveBeenCalledTimes(1);
});

it("shows no matches without disabling Open in editor", async () => {
  mocks.params.search = "absent";
  await render();
  await act(async () => {
    await editorProps().onReady?.();
    await editorProps().onMatchesChange?.({ total: 0, activeIndex: null });
  });
  expect(container.textContent).toContain("No matches");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next match"]')!.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Open in editor"]')!.disabled).toBe(false);
});

it.each([undefined, ["one", "two"], "   "])("omits match controls without a valid content search: %s", async (search) => {
  mocks.params.search = search;
  await render();
  expect(editorProps().matches).toEqual([]);
  expect(container.querySelector('[aria-label="Next match"]')).toBeNull();
});

it("ignores late match reports after the preview search changes", async () => {
  mocks.params.search = "answer";
  await render();
  const previousReport = editorProps().onMatchesChange;
  mocks.params.search = "export";
  await render();
  expect(editorProps().matches).toEqual(["export"]);
  await act(async () => {
    await editorProps().onReady?.();
    await editorProps().onMatchesChange?.({ total: 1, activeIndex: 0 });
    await previousReport?.({ total: 99, activeIndex: 42 });
  });
  expect(container.textContent).toContain("1 / 1");
  expect(container.textContent).not.toContain("43 / 99");
});

vi.mock("@/features/settings/hooks/use-editor-preferences", async () => { const { defaultEditorPreferences } = await import("@/features/settings/constants"); return { useEditorPreferences: () => ({ preferences: defaultEditorPreferences }) }; });
