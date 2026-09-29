// @vitest-environment happy-dom
vi.mock("@/features/projects/components/project-image-preview-content", () => ({
  ProjectImagePreviewContent: () => null,
}));
vi.mock("@/features/editor/explanation-actions", () => ({
  streamEditorExplanation: async (
    _input: unknown,
    _signal: AbortSignal,
    onText: (text: string) => void,
  ) => {
    onText("Explained selection");
  },
}));
// Narration reaches the filesystem and audio session, neither of which exist here.
vi.mock("@/features/editor/explanation-speech-client", () => ({
  explanationSpeech: () => ({ speak: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/features/projects/components/project-code-selection-menu", () => ({
  ProjectCodeSelectionMenu: ({
    onExplain,
    canExplain,
  }: {
    onExplain?: () => void;
    canExplain?: boolean;
  }) =>
    createElement("button", {
      onClick: onExplain,
      disabled: !canExplain,
      "aria-label": "Explain selection",
    }),
}));
vi.mock("@/features/editor/components/editor-explanation-bubble", () => ({
  EditorExplanationBubble: ({ state, onClose }: any) =>
    createElement(
      "section",
      { "data-explanation": true },
      state.text,
      createElement("button", {
        onClick: onClose,
        "aria-label": "Close explanation",
      }),
    ),
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => undefined,
}));
vi.mock(
  "@/features/projects/components/project-code-keyboard-accessory",
  () => ({ ProjectCodeKeyboardAccessory: () => null }),
);
import { act, createElement, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectFileSaveRegistryProvider } from "@/features/projects/hooks/use-project-file-save";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AgentScreen from "@/app/projects/[projectId]/agent";
import CodeScreen from "@/app/projects/[projectId]/code";
import GitScreen from "@/app/projects/[projectId]/git";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import type { SaveSnapshot } from "../lib/project-file-save-document";

const fileQuery = vi.hoisted(() => ({
  data: undefined as
    { path: string; content: string; size: number } | undefined,
  isPending: true,
  isError: false,
  isFetching: true,
  error: null as Error | null,
  refetch: vi.fn(),
}));
const selection = vi.hoisted(() => ({
  activeFilePath: null as string | null,
  version: 0,
  openFile: vi.fn(),
  closeFile: vi.fn(),
  getFileVersion: () => 0,
  get openFilePaths() {
    return new Set(selection.activeFilePath ? [selection.activeFilePath] : []);
  },
  refreshFile: vi.fn(),
}));
vi.mock("react-native-reanimated", async () => {
  const { FlatList } = await import("react-native");
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
    springify: () => transition,
    dampingRatio: () => transition,
  };
  return {
    default: {
      FlatList,
      View: ({ children }: { children?: ReactNode }) =>
        createElement("div", null, children),
    },
    LinearTransition: transition,
    FadeIn: transition,
    FadeOut: transition,
    ReduceMotion: { System: "system" },
  };
});
vi.mock("@/features/projects/hooks/use-project-workspace-current-file", () => ({
  useProjectWorkspaceCurrentFile: () => selection,
}));
vi.mock("@/features/projects/hooks/use-project-workspace-dock-height", () => ({
  useProjectWorkspaceDockHeight: () => ({
    dockHeight: 0,
    setDockHeight: vi.fn(),
  }),
}));
const saveFile = vi.hoisted(() => vi.fn());
vi.mock("@/features/projects/actions/file-actions", () => ({
  saveProjectFileContentAction: saveFile,
  readProjectFileContentAction: async () => fileQuery.data ?? null,
}));
const readFile = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const showAlert = vi.hoisted(() => vi.fn());
const focusEditor = vi.hoisted(() => vi.fn());
const dismissKeyboard = vi.hoisted(() => vi.fn());
vi.mock("@/features/projects/hooks/use-project-file", () => ({
  useProjectFile: (...args: unknown[]) => {
    readFile(...args);
    return fileQuery;
  },
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/ui/keyboard-aware-view", () => ({
  KeyboardAwareView: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => createElement("button", { onClick: onPress }, children),
}));
const state = vi.hoisted(() => ({
  interaction: undefined as (() => Promise<void>) | undefined,
  highlight: null as unknown,
  editorMounts: 0,
  empty: false,
  focus: 0,
  change: undefined as ((value: string) => Promise<void>) | undefined,
  ready: undefined as (() => Promise<void>) | undefined,
  analysis: undefined as
    ((value: CodeEditorAnalysis) => Promise<void>) | undefined,
}));
vi.mock("@/features/projects/actions/code-intelligence-actions", () => ({
  readProjectCodeIntelligence: vi.fn(),
}));
vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ isDarkMode: true }),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ projectId: "project-one" }),
  useRouter: () => ({ push: vi.fn(), navigate }),
  useFocusEffect: (effect: () => void | (() => void)) =>
    useEffect(effect, [effect, state.focus]),
}));
vi.mock("@/hooks/use-editor-development-shortcuts", () => ({
  useEditorDevelopmentShortcuts: () => {},
}));
vi.mock("@/features/projects/components/project-code-tabs", () => ({
  ProjectCodeTabs: ({
    paths,
    activePath,
    save,
    onRetry,
    readError,
  }: {
    paths: string[];
    activePath: string | null;
    save?: SaveSnapshot;
    onRetry?: () => void;
    readError?: boolean;
  }) =>
    createElement(
      "span",
      { "data-testid": "code-tabs" },
      paths.join(" "),
      save?.status === "error"
        ? createElement(
            "button",
            {
              "aria-label": `${readError ? "Retry opening" : "Retry saving"} ${activePath}`,
              onClick: onRetry,
            },
            "Error",
          )
        : save?.status === "saved"
          ? createElement(
              "button",
              { "aria-label": `Close ${activePath}` },
              "X",
            )
          : createElement("span", { role: "progressbar" }),
    ),
}));
vi.mock("@/features/projects/components/project-code-tools", () => ({
  ProjectCodeTools: ({ path }: { path: string }) =>
    createElement("button", {
      "aria-label": "Editor tools",
      "data-path": path,
    }),
}));
vi.mock("@/components/code-editor", () => ({
  default: ({
    ref,
    documentKey,
    onReady,
    onAnalysis,
    onChange,
    onContext,
    onInteractionChange,
    explanationRange,
    colorScheme,
    initialValue,
    readOnly,
  }: {
    onContext?: (id: string, snapshot: unknown) => Promise<void>;
    onInteractionChange?: (state: unknown, key: string) => Promise<void>;
    explanationRange?: unknown;
    ref?: { current: unknown };
    documentKey: string;
    onChange: (value: string) => Promise<void>;
    onReady: (key?: string) => Promise<void>;
    onAnalysis: (value: CodeEditorAnalysis, key?: string) => Promise<void>;
    colorScheme: string;
    initialValue: string;
    readOnly?: boolean;
  }) => {
    useEffect(() => {
      state.editorMounts++;
    }, []);
    if (ref)
      ref.current = {
        focus: focusEditor,
        captureContext: (id: string) =>
          onContext?.(id, {
            documentKey,
            revision: 1,
            content: initialValue,
            from: 0,
            to: 5,
            focused: false,
          }),
      };
    state.interaction = async () => {
      await onInteractionChange?.(
        { focused: false, hasSelection: true, revision: 1 },
        documentKey,
      );
    };
    state.highlight = explanationRange;
    state.change = onChange;
    state.ready = () => onReady(documentKey);
    state.analysis = (value) => onAnalysis(value, documentKey);
    return createElement("textarea", {
      key: initialValue,
      defaultValue: initialValue,
      readOnly,
      "data-theme": colorScheme,
    });
  },
}));
vi.mock("@/components/code-editor-loading", () => ({
  CodeEditorLoading: () =>
    createElement("span", null, "Initializing your editor"),
}));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name, className }: { name: string; className: string }) =>
    createElement("span", { "data-icon": name, "data-class": className }),
}));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children);
  return { PText: Text, HeadingText: Text, CodeText: Text };
});
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0 }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: showAlert },
  Keyboard: { dismiss: dismissKeyboard },
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  View: ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => createElement("div", { "aria-label": accessibilityLabel }, children),
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, onClick: onPress },
      children,
    ),
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => ReactNode;
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
  }) =>
    createElement(
      "div",
      null,
      ListHeaderComponent,
      data.length
        ? data.map((item, index) =>
            createElement("div", { key: index }, renderItem({ item, index })),
          )
        : ListEmptyComponent,
    ),
}));
vi.mock("@/features/projects/components/project-git-tabs", () => ({
  ProjectGitTabs: () => null,
  ProjectGitTabPanel: ({
    children,
    active,
  }: {
    children: ReactNode;
    active: boolean;
  }) => (active ? children : null),
}));
vi.mock("@/features/projects/components/project-changes-panel", () => ({
  ProjectChangesPanel: () =>
    createElement("span", null, "No uncommitted changes"),
}));
vi.mock("@/features/projects/components/project-branch-select", () => ({
  ProjectBranchSelect: () => null,
}));
vi.mock("@/features/projects/components/project-workspace-search", () => ({
  ProjectWorkspaceSearch: () => null,
}));
vi.mock("@/features/projects/components/project-agent-search", () => ({
  ProjectAgentSearch: () => null,
}));
vi.mock("@/features/projects/hooks/use-project-workspace-branch", () => ({
  useProjectWorkspaceBranch: () => ({
    projectId: "project-one",
    gitTab: "changes",
    setGitTab: vi.fn(),
  }),
}));
vi.mock("@/features/projects/hooks/use-project-commit-history", () => ({
  useProjectCommitHistory: vi.fn(),
}));
vi.mock("@/features/agent/hooks/use-agent-tasks", () => ({
  useAgentTasks: () => [],
}));
vi.mock("@/features/agent/components/task-activity-card", () => ({
  TaskActivityCard: () => null,
}));
vi.mock("@/features/agent/components/task-activity-sheet", () => ({
  TaskActivitySheet: () => null,
}));

// Upload controls added to the Files toolbar: stub their device dependencies.
vi.mock("@/features/projects/hooks/use-project-file-upload", () => ({
  useProjectFileUpload: () => ({
    items: [],
    totalBytes: 0,
    isPicking: false,
    pickFiles: vi.fn(async () => []),
    pickFolder: vi.fn(async () => []),
    clear: vi.fn(),
    setItems: vi.fn(),
  }),
}));
vi.mock("@/features/projects/hooks/use-import-project-files", () => ({
  useImportProjectFiles: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/use-success-feedback", () => ({
  useSuccessFeedback: () => vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(fileQuery, {
    data: undefined,
    isPending: true,
    isError: false,
    isFetching: true,
    error: null,
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  saveFile.mockReset();
  showAlert.mockReset();
  navigate.mockClear();
  state.empty = false;
  state.focus = 0;
  state.editorMounts = 0;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.useRealTimers();
});

it("shows real empty Agent state without a mocked loading delay", () => {
  act(() => root.render(createElement(AgentScreen)));
  expect(container.textContent).not.toContain("Loading activity");
  expect(container.textContent).toContain("No activity yet");
});

const renderCode = (path: string | null = "app/page.tsx") => {
  selection.activeFilePath = path;
  act(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ProjectFileSaveRegistryProvider, {
          projectId: "project-one",
          children: createElement(CodeScreen),
        }),
      ),
    ),
  );
};
const finishLoading = (content = "const value = 1;", path = "app/page.tsx") => {
  Object.assign(fileQuery, {
    data: { path, content, size: content.length },
    isPending: false,
    isFetching: false,
    isError: false,
  });
};

it("warms one read-only editor before selecting or reading a file without accepting stale readiness", async () => {
  renderCode(null);
  expect(container.querySelector("textarea")?.readOnly).toBe(true);
  expect(state.editorMounts).toBe(1);
  const warmReady = state.ready!;
  renderCode();
  expect(state.editorMounts).toBe(1);
  expect(container.querySelector("textarea")?.readOnly).toBe(true);
  finishLoading();
  renderCode();
  await act(async () => warmReady());
  expect(container.textContent).toContain("Initializing your editor");
  await act(async () => state.ready!());
  expect(container.textContent).not.toContain("Initializing your editor");
  expect(container.querySelector("textarea")?.readOnly).toBe(false);
  expect(state.editorMounts).toBe(1);
});

it("shows severity counts in the floating badge and resets them for another file", async () => {
  finishLoading();
  renderCode();
  expect(container.textContent).toContain("app/page.tsx");
  const previousAnalysis = state.analysis!;
  const diagnostic = {
    from: 0,
    to: 1,
    message: "Problem",
    source: "TypeScript",
    code: "TS1",
  };
  await act(async () =>
    state.analysis!({
      status: "ready",
      diagnostics: [
        { ...diagnostic, severity: "error" },
        { ...diagnostic, severity: "warning" },
        { ...diagnostic, severity: "info" },
      ],
    }),
  );
  expect(
    container.querySelector(
      'button[aria-label="1 error, 1 warning, 1 information message."]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelector('button[aria-label^="1 error"]'),
  ).not.toBeNull();
  finishLoading("", "other.ts");
  renderCode("other.ts");
  await act(async () =>
    previousAnalysis({
      status: "ready",
      diagnostics: [{ ...diagnostic, severity: "error" }],
    }),
  );
  expect(
    container.querySelector('button[aria-label="Checking code…"]'),
  ).not.toBeNull();
  expect(container.querySelector('[aria-label^="1 error"]')).toBeNull();
  await act(async () =>
    state.analysis!({ status: "unavailable", diagnostics: [] }),
  );
  expect(
    container.querySelector('button[aria-label="Code analysis unavailable."]'),
  ).not.toBeNull();
});

it("omits the empty diagnostics surface for plain text files", async () => {
  finishLoading("notes", "notes.txt");
  renderCode("notes.txt");
  await act(async () => state.ready!());
  expect(
    container.querySelector('[data-testid="editor-status-measure"]'),
  ).toBeNull();
  await act(async () =>
    state.analysis!({ status: "unsupported", diagnostics: [] }),
  );
  expect(
    container.querySelector('[data-testid="editor-status-measure"]'),
  ).toBeNull();
  expect(
    container.querySelector('button[aria-label="Format code"]'),
  ).not.toBeNull();
});

it("shows the same loading UI for fetching and editor startup, without a preview timer", async () => {
  renderCode();
  expect(readFile).toHaveBeenLastCalledWith("project-one", "app/page.tsx");
  expect(container.textContent).toContain("Initializing your editor");
  expect(container.querySelector("textarea")?.readOnly).toBe(true);
  finishLoading();
  renderCode();
  expect(container.querySelector("textarea")?.value).toBe("const value = 1;");
  expect(container.querySelector("textarea")?.dataset.theme).toBe("dark");
  expect(container.textContent).toContain("Initializing your editor");
  await act(async () => {
    await state.ready!();
  });
  expect(container.textContent).not.toContain("Initializing your editor");
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves edits when the same file refreshes or the tab is revisited", async () => {
  finishLoading();
  renderCode();
  await act(async () => {
    await state.ready!();
  });
  const editor = container.querySelector("textarea")!;
  editor.value = "unsaved edit";
  finishLoading("updated remotely");
  state.focus++;
  renderCode();
  expect(container.querySelector("textarea")).toBe(editor);
  expect(editor.value).toBe("unsaved edit");
  expect(container.textContent).not.toContain("Initializing your editor");
  Object.assign(fileQuery, { isError: true, error: new Error("Offline") });
  renderCode();
  expect(container.querySelector("textarea")).toBe(editor);
});

it("resets content and readiness on file changes, including cached empty files", async () => {
  finishLoading();
  renderCode();
  const oldReady = state.ready!;
  await act(async () => {
    await oldReady();
  });
  const oldEditor = container.querySelector("textarea");
  finishLoading("", "empty.ts");
  renderCode("empty.ts");
  expect(container.querySelector("textarea")).not.toBe(oldEditor);
  expect(container.querySelector("textarea")?.value).toBe("");
  await act(async () => {
    await oldReady();
  });
  expect(container.textContent).toContain("Initializing your editor");
  await act(async () => {
    await state.ready!();
  });
  expect(container.textContent).not.toContain("Initializing your editor");
});

it("shows a selection prompt immediately when there is no current file", () => {
  renderCode(null);
  expect(readFile).toHaveBeenLastCalledWith("project-one", null);
  expect(container.textContent).toContain("No file selected");
  expect(container.textContent).not.toContain("Initializing your editor");
  expect(container.querySelector("textarea")?.readOnly).toBe(true);
});

it("replaces the empty tab header with Open file and restores it only while files are open", () => {
  renderCode(null);
  expect(container.querySelector('[data-testid="code-tabs"]')).toBeNull();
  expect(container.querySelector('[aria-label="Editor tools"]')).toBeNull();
  const open = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Open file",
  );
  expect(open).toBeDefined();
  act(() => open!.click());
  expect(navigate).toHaveBeenCalledExactlyOnceWith({
    pathname: "/projects/[projectId]/files",
    params: { projectId: "project-one" },
  });
  finishLoading();
  renderCode();
  expect(container.querySelector('[data-testid="code-tabs"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Editor tools"]')).toBeNull();
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "Open file",
    ),
  ).toBe(false);
  renderCode(null);
  expect(container.querySelector('[data-testid="code-tabs"]')).toBeNull();
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "Open file",
    ),
  ).toBe(true);
});

it("shows file errors with a retry and resumes loading while retrying", () => {
  Object.assign(fileQuery, {
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error("This file is too large to open."),
  });
  renderCode();
  expect(container.textContent).toContain("This file is too large to open.");
  expect(container.querySelector("textarea")?.readOnly).toBe(true);
  act(() => container.querySelector("button")!.click());
  expect(fileQuery.refetch).toHaveBeenCalledTimes(1);
  Object.assign(fileQuery, {
    isPending: true,
    isFetching: true,
    isError: false,
  });
  renderCode();
  expect(container.textContent).toContain("Initializing your editor");
});

it.each([{ name: "Git", Screen: GitScreen, empty: "No uncommitted changes" }])(
  "handles missing screen data after loading: $name",
  ({ Screen, empty }) => {
    state.empty = true;
    act(() => root.render(createElement(Screen)));
    expect(container.textContent).toContain(empty);
    expect(container.querySelector("textarea")).toBeNull();
  },
);

it("does not schedule a demo loading timer for Agent", () => {
  act(() => root.render(createElement(AgentScreen)));
  expect(vi.getTimerCount()).toBe(0);
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});
it("shows save progress in the active tab, then offers retry after failure", async () => {
  renderCode();
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  finishLoading();
  renderCode();
  await act(async () => state.ready!());
  expect(
    container.querySelector('[aria-label="Close app/page.tsx"]'),
  ).not.toBeNull();
  const diagnostic = {
    from: 0,
    to: 1,
    message: "Problem",
    source: "TypeScript",
    code: "TS1",
    severity: "error" as const,
  };
  await act(async () =>
    state.analysis!({ status: "ready", diagnostics: [diagnostic] }),
  );
  const icons = [...container.querySelectorAll("[data-icon]")].map((icon) =>
    icon.getAttribute("data-icon"),
  );
  expect(icons.slice(-7)).toEqual([
    "format-align-left",
    "sort-alphabetical-ascending",
    "magnify",
    "book-plus",
    "console",
    "undo",
    "redo",
  ]);
  let finish!: (value: unknown) => void;
  saveFile.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => state.change!("edited"));
  expect(
    container.querySelector('[aria-label="Close app/page.tsx"]'),
  ).toBeNull();
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(saveFile).toHaveBeenCalledOnce();
  await act(async () => finish({ error: true, message: "Save failed." }));
  expect(
    container.querySelector('[aria-label="Retry saving app/page.tsx"]'),
  ).not.toBeNull();
  expect(showAlert).toHaveBeenCalledWith(
    "Couldn't save this file",
    "Save failed.",
    expect.any(Array),
  );
  expect(container.querySelector("textarea")?.value).toBe("const value = 1;");
  saveFile.mockResolvedValueOnce({
    error: false,
    message: "Saved.",
    data: { path: "app/page.tsx", size: 6, contentHash: "a".repeat(64) },
  });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Retry saving app/page.tsx"]',
      )!
      .click(),
  );
  expect(saveFile).toHaveBeenCalledTimes(2);
  expect(
    container.querySelector('[aria-label="Close app/page.tsx"]'),
  ).not.toBeNull();
});

it("shows file read failures in the active tab and retries the read", () => {
  Object.assign(fileQuery, {
    data: undefined,
    isError: true,
    isFetching: false,
    error: new Error("File unavailable"),
  });
  renderCode();
  const retry = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Retry opening app/page.tsx"]',
  );
  expect(retry).not.toBeNull();
  act(() => retry!.click());
  expect(fileQuery.refetch).toHaveBeenCalledOnce();
});

vi.mock("@/features/settings/hooks/use-editor-preferences", async () => {
  const { useState } = await import("react");
  const { defaultEditorPreferences } =
    await import("@/features/settings/constants");
  return {
    useEditorPreferences: () => {
      const [preferences, setPreferences] = useState(defaultEditorPreferences);
      return {
        preferences,
        ready: true,
        error: null,
        update: async (patch: Partial<typeof preferences>) =>
          setPreferences((value) => ({ ...value, ...patch })),
      };
    },
  };
});

vi.mock("@/features/editor/components/editor-problems-sheet", () => ({
  EditorProblemsSheet: () => null,
}));
vi.mock("@/features/editor/components/editor-search-bar", () => ({
  EditorSearchBar: ({ onClose }: { onClose: () => void }) =>
    createElement("button", {
      "aria-label": "Close file search",
      onClick: onClose,
    }),
}));
vi.mock("expo-clipboard", () => ({
  getStringAsync: async () => "",
  setStringAsync: async () => true,
}));

it("closing file search returns focus to the same editor without dismissing the keyboard", async () => {
  finishLoading();
  renderCode();
  await act(async () => state.ready!());
  const original = container.querySelector("textarea");
  const search = container.querySelector<HTMLButtonElement>(
    '[aria-label="Find in file"]',
  );
  expect(search).not.toBeNull();
  act(() => search!.click());
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Close file search"]')!
      .click(),
  );
  expect(focusEditor).toHaveBeenCalledWith(expect.any(String));
  expect(dismissKeyboard).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")).toBe(original);
});

it("explains a selection through the screen and removes its highlight on dismissal", async () => {
  finishLoading();
  renderCode();
  await act(async () => {
    await state.ready!();
    await state.interaction!();
  });
  const explain = container.querySelector<HTMLButtonElement>(
    '[aria-label="Explain selection"]',
  )!;
  expect(explain.disabled).toBe(false);
  await act(async () => explain.click());
  expect(container.querySelector("[data-explanation]")?.textContent).toContain(
    "Explained selection",
  );
  expect(state.highlight).toMatchObject({ from: 0, to: 5 });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Close explanation"]')!
      .click(),
  );
  expect(container.querySelector("[data-explanation]")).toBeNull();
  expect(state.highlight).toBeNull();
  expect(
    container.querySelector('[aria-label="Explain selection"]'),
  ).not.toBeNull();
});
