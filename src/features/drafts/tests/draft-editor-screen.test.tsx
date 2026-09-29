// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const id = "00000000-0000-4000-8000-0000000000ab";
const mocks = vi.hoisted(() => ({
  id: "new",
  draft: null as null | {
    id: string;
    filename: string | null;
    content: string;
  },
  saveNow: vi.fn(),
  schedule: vi.fn(),
  alert: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  asset: false,
  editor: {} as Record<string, unknown>,
  header: {} as Record<string, unknown>,
  dock: {} as Record<string, unknown>,
  voiceEnabled: false,
  toolbar: {} as Record<string, unknown>,
  search: {} as Record<string, unknown>,
  accessory: {} as Record<string, unknown>,
  keyboardFrame: null as null | {
    screenY: number;
    screenX: number;
    height: number;
    width: number;
  },
  conversationVisible: false,
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => id }));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ draftId: mocks.id }),
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  ActivityIndicator: () => createElement("progress"),
}));
vi.mock("@/components/code-editor", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.editor = props;
    return createElement("div", { "data-editor": true });
  },
}));
vi.mock("@/components/code-editor-loading", () => ({
  CodeEditorLoading: () => null,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
  }: {
    children?: ReactNode;
    onPress?: () => void;
  }) => createElement("button", { onClick: onPress }, children),
}));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  PText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("@/features/drafts/components/draft-editor-header", () => ({
  DraftEditorHeader: (props: Record<string, unknown>) => {
    mocks.header = props;
    return createElement("div", { "data-header": true });
  },
}));
vi.mock("@/features/drafts/components/draft-editor-dock", () => ({
  DraftEditorDock: (props: Record<string, unknown>) => {
    mocks.dock = props;
    return createElement("div", { "data-dock": true });
  },
}));
vi.mock("@/features/projects/components/project-code-toolbar", () => ({
  ProjectCodeToolbar: (props: Record<string, unknown>) => {
    mocks.toolbar = props;
    return createElement("div", { "data-toolbar": true });
  },
}));
vi.mock("@/features/editor/components/editor-search-bar", () => ({
  EditorSearchBar: (props: Record<string, unknown>) => {
    mocks.search = props;
    return createElement("div", { "data-search": true });
  },
}));
vi.mock("@/features/editor/components/editor-bottom-bar", () => ({
  EditorBottomBar: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/features/voice/hooks/use-voice-editor", () => ({
  useVoiceEditor: () => ({
    onContext: vi.fn(),
    onInteraction: vi.fn(),
    onSuggestionAction: vi.fn(),
    onSuggestionApplied: vi.fn(),
  }),
}));
vi.mock("@/features/voice/hooks/use-voice-conversation", () => ({
  useVoiceConversation: (enabled: boolean) => {
    mocks.voiceEnabled = enabled;
    return { visible: mocks.conversationVisible };
  },
}));
vi.mock("@/features/voice/components/voice-transcript-bubble", () => ({
  VoiceTranscriptBubble: () => null,
}));
vi.mock("@/features/voice/components/voice-microphone", () => ({
  VoiceMicrophone: () => createElement("div", { "data-microphone": true }),
}));
vi.mock("@/features/voice/components/inline-voice-controls", () => ({
  InlineVoiceControls: () =>
    createElement("div", { "data-voice-feedback": true }),
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => mocks.keyboardFrame,
}));
vi.mock(
  "@/features/projects/components/project-code-keyboard-accessory",
  () => ({
    ProjectCodeKeyboardAccessory: (props: Record<string, unknown>) => {
      mocks.accessory = props;
      return null;
    },
  }),
);
vi.mock("@/features/drafts/components/draft-asset-preview-content", () => ({
  DraftAssetPreviewContent: () => createElement("div", { "data-asset": true }),
}));
vi.mock("@/features/editor/components/editor-problems-sheet", () => ({
  EditorProblemsSheet: () => null,
}));
vi.mock("@/features/drafts/hooks/use-draft", () => ({
  useDraft: () => ({ data: mocks.draft, isError: false }),
}));
vi.mock("@/features/drafts/hooks/use-draft-save", () => ({
  useDraftSave: () => ({
    draftId: mocks.draft?.id ?? null,
    state: "unsaved",
    message: null,
    schedule: mocks.schedule,
    saveNow: mocks.saveNow,
    hasUnsavedChanges: () => false,
  }),
}));
vi.mock("@/features/drafts/hooks/use-delete-draft", () => ({
  useDeleteDraft: () => ({ isPending: false }),
}));
vi.mock("@/features/drafts/lib/draft-intelligence", () => ({
  disposeDraftIntelligence: vi.fn(),
  readDraftCodeIntelligence: vi.fn(),
}));
vi.mock("@/features/drafts/lib/draft-assets", () => ({
  draftHasAsset: () => mocks.asset,
  draftAssetFile: () => ({ uri: "file:///draft-asset" }),
}));
vi.mock("@/features/projects/lib/image-files", () => ({
  isProjectImagePath: (path: string) => /\.(png|jpg|jpeg)$/i.test(path),
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  useEditorPreferences: () => ({ preferences: {} }),
}));
vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("@/lib/utils", () => ({
  isValidIds: (value: string) => value === id,
  alert: mocks.alert,
  confirmAction: vi.fn(),
}));

import DraftEditorScreen from "@/app/draft/[draftId]";

let root: Root;
let container: HTMLDivElement;
const render = async () => {
  await act(async () => {
    root.render(createElement(DraftEditorScreen));
  });
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  mocks.id = "new";
  mocks.draft = null;
  mocks.asset = false;
  mocks.voiceEnabled = false;
  mocks.keyboardFrame = null;
  mocks.conversationVisible = false;
  mocks.saveNow.mockReset();
  mocks.schedule.mockReset();
  mocks.alert.mockReset();
  mocks.push.mockReset();
  mocks.back.mockReset();
});
afterEach(() => act(() => root.unmount()));

describe("draft editor screen", () => {
  it("keeps an unnamed draft in plain text and only schedules a save after input", async () => {
    await render();
    expect(mocks.editor.filename).toBe("");
    expect(mocks.editor.onContext).toBeTypeOf("function");
    expect(mocks.voiceEnabled).toBe(false);
    await act(async () => {
      await (mocks.editor.onReady as (key: string) => Promise<void>)(
        mocks.editor.documentKey as string,
      );
    });
    expect(mocks.voiceEnabled).toBe(true);
    expect(mocks.dock.conversation).toBeTruthy();
    expect(mocks.schedule).not.toHaveBeenCalled();
    await act(async () => {
      await (mocks.editor.onChange as (text: string) => Promise<void>)("hello");
    });
    expect(mocks.schedule).toHaveBeenCalledWith({
      filename: null,
      content: "hello",
    });
  });

  it("renames a saved draft without replacing the editor document", async () => {
    mocks.id = id;
    mocks.draft = { id, filename: "idea.txt", content: "notes" };
    await render();
    const originalKey = mocks.editor.documentKey;
    act(() =>
      (mocks.header.onFilenameChange as (name: string) => void)("idea.py"),
    );
    expect(mocks.editor.documentKey).toBe(originalKey);
    expect(mocks.editor.filename).toBe("idea.py");
    expect(mocks.schedule).toHaveBeenCalledWith({
      filename: "idea.py",
      content: "notes",
    });
  });

  it("shows a stored image as an asset instead of loading CodeMirror", async () => {
    mocks.id = id;
    mocks.asset = true;
    mocks.draft = { id, filename: "diagram.png", content: "" };
    await render();
    expect(container.querySelector("[data-asset]")).not.toBeNull();
    expect(container.querySelector("[data-editor]")).toBeNull();
  });

  it("requires a durable draft before opening the copy flow", async () => {
    mocks.saveNow.mockResolvedValueOnce(null).mockResolvedValueOnce(id);
    await render();
    await act(async () => {
      await (mocks.dock.onCopyToProject as () => Promise<void>)();
    });
    expect(mocks.alert).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => {
      await (mocks.dock.onCopyToProject as () => Promise<void>)();
    });
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/draft/copy-to-project",
      params: { draftId: id },
    });
  });

  it("offers project editing actions in a draft without project-only actions", async () => {
    await render();
    await act(async () => {
      await (mocks.editor.onReady as (key: string) => Promise<void>)(
        mocks.editor.documentKey as string,
      );
    });
    expect(mocks.toolbar.draft).toBe(true);
    expect(mocks.toolbar.onFormat).toBeTypeOf("function");
    expect(mocks.toolbar.onOrganize).toBeTypeOf("function");
    expect(mocks.toolbar.onUndo).toBeTypeOf("function");
    expect(mocks.toolbar.onRedo).toBeTypeOf("function");
    expect(mocks.toolbar.onTerminal).toBeUndefined();
    expect(mocks.toolbar.onInsertFromDraft).toBeUndefined();
    expect(container.querySelector("[data-toolbar]")).not.toBeNull();
    act(() => (mocks.toolbar.onFind as () => void)());
    expect(container.querySelector("[data-search]")).not.toBeNull();
    expect(mocks.editor.searchQuery).toEqual({ search: "" });
    expect(mocks.search.onCommand).toBeTypeOf("function");
  });

  it("puts active draft voice feedback above the keyboard rows", async () => {
    mocks.keyboardFrame = { screenY: 544, screenX: 0, height: 300, width: 390 };
    mocks.conversationVisible = true;
    await render();
    await act(async () => {
      await (mocks.editor.onReady as (key: string) => Promise<void>)(
        mocks.editor.documentKey as string,
      );
      await (
        mocks.editor.onInteractionChange as (
          state: { focused: boolean },
          key: string,
        ) => Promise<void>
      )({ focused: true }, mocks.editor.documentKey as string);
    });
    expect(mocks.accessory.voiceActive).toBe(true);
    expect(mocks.accessory.voiceFeedbackAboveRows).toBe(true);
    expect(mocks.accessory.feedback).toBeTruthy();
    expect(mocks.accessory.voice).toBeNull();
    expect(mocks.dock.showVoiceFeedback).toBe(false);
  });
});
