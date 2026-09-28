// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectWorkspaceDock } from "../components/project-workspace-dock";
import {
  ProjectWorkspaceDockHeightProvider,
  useProjectWorkspaceDockHeight,
} from "../hooks/use-project-workspace-dock-height";
import { EditorBottomBar } from "@/features/editor/components/editor-bottom-bar";

const mocks = vi.hoisted(() => ({
  layouts: new Map<string, (event: unknown) => void>(),
  keyboardVisible: false,
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  View: ({
    children,
    onLayout,
    testID,
    style,
  }: {
    children?: ReactNode;
    onLayout?: (event: unknown) => void;
    testID?: string;
    style?: object;
  }) => {
    if (onLayout) mocks.layouts.set(testID ?? "controls", onLayout);
    return createElement("div", { "data-testid": testID, style }, children);
  },
}));
vi.mock("react-native-reanimated", () => {
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
  };
  return {
    default: {
      View: ({
        children,
        style,
        layout,
        testID,
      }: {
        children?: ReactNode;
        style?: object;
        layout?: unknown;
        testID?: string;
      }) =>
        createElement(
          "div",
          { style, "data-testid": testID, "data-animated-layout": !!layout },
          children,
        ),
    },
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
  };
});
vi.mock("expo-router", () => ({ usePathname: () => "/projects/project/code" }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () =>
    mocks.keyboardVisible ? { screenY: 500, height: 344 } : undefined,
}));
vi.mock("@/hooks/use-keyboard-symbols", () => ({
  useKeyboardSymbolsInset: () => 0,
}));
vi.mock("../hooks/use-project-workspace-branch", () => ({
  useProjectWorkspaceBranch: () => ({ projectId: "project" }),
}));
vi.mock("@/features/voice/hooks/use-voice-conversation", () => ({
  useVoiceConversation: () => ({ visible: true }),
}));
vi.mock("@/features/agent/components/task-status-bar", () => ({
  TaskStatusBar: () => createElement("div", null, "Task status"),
}));
vi.mock("@/features/agent/components/implementation-plan-review", () => ({
  ImplementationPlanReview: () => null,
}));
vi.mock("@/features/voice/components/voice-transcript-bubble", () => ({
  VoiceTranscriptBubble: () => createElement("div", null, "Transcript"),
}));
vi.mock("@/features/voice/components/voice-microphone", () => ({
  VoiceMicrophone: () => null,
}));
vi.mock("../components/project-action-buttons", () => ({
  ProjectActionButtonsLeft: () => null,
  ProjectActionButtonsRight: () =>
    createElement("input", { "data-testid": "settings-sheet-host" }),
}));
vi.mock("../components/project-branch-menu", () => ({
  ProjectBranchMenu: () => null,
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) => children,
}));

const Controls = () => {
  const { dockHeight } = useProjectWorkspaceDockHeight();
  return (
    <EditorBottomBar dockHeight={dockHeight} onHeight={() => {}}>
      Editor commands
    </EditorBottomBar>
  );
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.layouts.clear();
  mocks.keyboardVisible = false;
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root.render(
      <ProjectWorkspaceDockHeightProvider>
        <Controls />
        <ProjectWorkspaceDock tab="code" />
      </ProjectWorkspaceDockHeightProvider>,
    ),
  );
});
afterEach(() => act(() => root.unmount()));

it("moves editor controls above the entire floating stack as tasks and transcripts appear and disappear", () => {
  const bar = container.querySelector(
    '[data-testid="editor-bottom-bar"]',
  ) as HTMLElement;
  const measure = (height: number) =>
    act(() =>
      mocks.layouts.get("project-workspace-dock")?.({
        nativeEvent: { layout: { height } },
      }),
    );
  act(() =>
    mocks.layouts.get("controls")?.({
      nativeEvent: { layout: { height: 118 } },
    }),
  );
  // Native onLayout reports action controls + safe area, then task/transcript heights.
  measure(118);
  expect(bar.style.bottom).toBe("126px");
  measure(178);
  expect(bar.style.bottom).toBe("186px");
  measure(318);
  expect(bar.style.bottom).toBe("326px");
  measure(118);
  expect(bar.style.bottom).toBe("126px");
  expect(bar.dataset.animatedLayout).toBe("true");
  // A hidden dock must not discard its last measurement while the keyboard is up.
  measure(0);
  expect(bar.style.bottom).toBe("126px");
});

it("never hides the native sheet host when a dock-owned input opens the keyboard", () => {
  const host = container.querySelector<HTMLInputElement>(
    '[data-testid="settings-sheet-host"]',
  )!;
  host.value = "Unsubmitted settings";
  for (const visible of [true, false, true, false]) {
    mocks.keyboardVisible = visible;
    act(() =>
      root.render(
        <ProjectWorkspaceDockHeightProvider>
          <Controls />
          <ProjectWorkspaceDock tab="code" />
        </ProjectWorkspaceDockHeightProvider>,
      ),
    );
    expect(container.querySelector('[data-testid="settings-sheet-host"]')).toBe(
      host,
    );
    expect(host.value).toBe("Unsubmitted settings");
    for (let node: HTMLElement | null = host; node; node = node.parentElement) {
      expect(node.style.display).not.toBe("none");
      expect(node.style.opacity).not.toBe("0");
    }
  }
});
