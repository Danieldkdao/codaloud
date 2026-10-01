// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVoiceConversation } from "../hooks/use-voice-conversation";
import { VoiceMicrophone } from "../components/voice-microphone";
import { inlineSession } from "../inline-session";
import { commandCenter } from "../command-center";
const mocks = vi.hoisted(() => ({
  textMode: false,
  control: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
  background: undefined as undefined | ((state: string) => void),
  button: {} as Record<string, any>,
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  useEditorPreferences: () => ({ preferences: { textMode: mocks.textMode } }),
}));
vi.mock("@/services/livekit/voice-native", () => ({
  connectNativeVoice: mocks.connect,
}));
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  Pressable: ({ children, ...props }: any) => {
    mocks.button = props;
    return createElement("button", null, children);
  },
  NativeModules: { WebRTCModule: {}, LivekitReactNativeModule: {} },
  AppState: {
    addEventListener: (_event: string, callback: (state: string) => void) => {
      mocks.background = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "" }));
vi.mock("@/lib/utils", () => ({
  cn: (...items: unknown[]) => items.filter(Boolean).join(" "),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children: ReactNode }) =>
      createElement("div", null, children),
  },
  ReduceMotion: { System: "system" },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (callback: () => unknown) => callback(),
  withSpring: (value: number) => value,
}));
let current!: ReturnType<typeof useVoiceConversation>;
const Harness = ({
  enabled = true,
  projectId,
  compact = false,
  draftOnly = false,
  launcher = false,
}: {
  enabled?: boolean;
  projectId?: string;
  compact?: boolean;
  draftOnly?: boolean;
  launcher?: boolean;
}) => {
  current = useVoiceConversation(enabled, "project", projectId, draftOnly);
  return (
    <VoiceMicrophone
      conversation={current}
      compact={compact}
      launcher={launcher}
    />
  );
};
it("keeps a draft conversation in inline edit mode even without editor focus", async () => {
  const scope = "draft:123";
  const unregister = inlineSession.register(scope, {
    capture: async () => ({
      projectId: scope,
      branch: "",
      openFiles: [],
      activeFile: {
        path: "idea.py",
        documentKey: "doc",
        revision: 1,
        content: "print(1)",
        from: 0,
        to: 0,
        focused: false,
      },
    }),
    preview: vi.fn(),
    apply: vi.fn(async () => true),
  });
  await act(async () => root.render(<Harness projectId={scope} draftOnly />));
  await act(async () => current.startHandsFree());
  expect(inlineSession.getSnapshot()?.mode).toBe("quick-edit");
  expect(mocks.connect).toHaveBeenCalledWith(
    "hands-free",
    expect.anything(),
    expect.anything(),
    { projectId: scope, draftOnly: true },
  );
  await act(async () => current.stop());
  unregister();
});
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  mocks.textMode = false;
  commandCenter.clear();
  vi.clearAllMocks();
  mocks.control.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue({
    control: mocks.control,
    close: mocks.close,
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
it("keeps the dock launcher mounted before, during, and after a spoken turn", async () => {
  await act(async () => root.render(<Harness launcher />));
  const originalButton = container.querySelector("button");
  await act(async () => {
    mocks.button.onPressIn();
    mocks.button.onLongPress();
  });
  expect(current.visible).toBe(true);
  expect(current.pressed).toBe(true);
  expect(container.querySelector("button")).not.toBeNull();
  await act(async () => mocks.button.onTouchEnd());
  expect(mocks.control).toHaveBeenLastCalledWith("commit");
  expect(current.state.listening).toBe(false);
  expect(container.querySelector("button")).toBe(originalButton);
  await act(async () => mocks.button.onPressIn());
  expect(container.querySelector("button")).not.toBeNull();
  await act(async () => mocks.button.onLongPress());
  expect(current.state.listening).toBe(true);
  await act(async () => mocks.button.onTouchEnd());
  expect(mocks.control.mock.calls.map(([action]) => action)).toEqual([
    "start",
    "commit",
    "start",
    "commit",
  ]);
});

it("keeps the dock control available through voice to text and back", async () => {
  await act(async () => root.render(<Harness launcher />));
  await act(async () => current.startHandsFree());
  expect(container.querySelector("button")).not.toBeNull();
  await act(async () => {
    current.pause();
    commandCenter.open("p");
    mocks.textMode = true;
    root.render(<Harness launcher />);
  });
  expect(container.querySelector("button")).not.toBeNull();
  expect(mocks.button.accessibilityLabel).toBe("Type a command");
  expect(commandCenter.getSnapshot().input?.projectId).toBe("p");
  await act(async () => {
    commandCenter.closeInput();
    mocks.textMode = false;
    root.render(<Harness launcher />);
  });
  expect(container.querySelector("button")).not.toBeNull();
  expect(mocks.button.accessibilityLabel).toBe("Microphone");
  await act(async () => current.startHandsFree());
  expect(current.state.listening).toBe(true);
});
it("opens typed commands and quick edits without importing or connecting the voice SDK", async () => {
  mocks.textMode = true;
  await act(async () => root.render(<Harness projectId="p" />));
  expect(mocks.button.accessibilityLabel).toBe("Type a command");
  await act(async () => mocks.button.onPress());
  expect(commandCenter.getSnapshot().input).toEqual({
    projectId: "p",
    mode: "agent",
  });
  expect(mocks.connect).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness projectId="p" compact />));
  await act(async () => mocks.button.onPress());
  expect(current.visible).toBe(true);
  expect(commandCenter.getSnapshot().input?.mode).toBe("quick-edit");
  expect(mocks.connect).not.toHaveBeenCalled();
});
it("closes an existing audio connection when text mode is enabled and blocks new voice starts", async () => {
  await act(async () => current.startHandsFree());
  expect(mocks.connect).toHaveBeenCalledOnce();
  mocks.textMode = true;
  await act(async () => root.render(<Harness />));
  expect(mocks.close).toHaveBeenCalledOnce();
  await act(async () => current.startHandsFree());
  expect(mocks.connect).toHaveBeenCalledOnce();
});
it("stops inline recording without discarding the request, then allows another edit after generation", async () => {
  const unregister = inlineSession.register("p", {
    capture: async () => ({
      projectId: "p",
      branch: "main",
      openFiles: [],
      activeFile: {
        path: "a.ts",
        documentKey: "doc",
        revision: 1,
        content: "",
        from: 0,
        to: 0,
        focused: false,
      },
    }),
    preview: vi.fn(),
    apply: vi.fn(async () => true),
  });
  await act(async () => root.render(<Harness projectId="p" />));
  await act(async () => current.startInline());
  const request = inlineSession.getSnapshot()!;
  expect(request.mode).toBe("quick-edit");
  await act(async () => current.pause());
  expect(inlineSession.getSnapshot()?.id).toBe(request.id);
  await act(async () => {
    inlineSession.receive({ id: request.id, type: "start" });
    inlineSession.receive({
      id: request.id,
      type: "delta",
      offset: 0,
      text: "code",
    });
    inlineSession.receive({ id: request.id, type: "complete" });
  });
  await act(async () => current.startInline());
  expect(inlineSession.getSnapshot()?.id).not.toBe(request.id);
  expect(current.state.listening).toBe(true);
  await act(async () => current.stop());
  unregister();
});
afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount());
});

it("keeps the specific failure visible when the agent reports a generic one", async () => {
  // The turn fails with an actionable message, then the agent session errors
  // and reports only "Failed to generate response". The specific reason must
  // survive, because it is what the user can act on.
  let agentEvents: { onError: (message: string) => void } | undefined;
  mocks.connect.mockImplementation(
    async (_mode: unknown, _signal: unknown, events: any) => {
      agentEvents = events;
      return { control: mocks.control, close: mocks.close };
    },
  );
  const unregister = inlineSession.register("p", {
    capture: async () => ({
      projectId: "p",
      branch: "main",
      openFiles: [],
      activeFile: {
        path: "a.ts",
        documentKey: "doc",
        revision: 1,
        content: "",
        from: 0,
        to: 0,
        focused: false,
      },
    }),
    preview: vi.fn(),
    apply: vi.fn(async () => true),
  });
  await act(async () => root.render(<Harness projectId="p" />));
  await act(async () => current.startInline());
  const id = inlineSession.getSnapshot()!.id;
  await act(async () => {
    inlineSession.receive({
      id,
      type: "error",
      message:
        "The edit target is ambiguous. Select a unique section and try again.",
    });
  });
  expect(inlineSession.getSnapshot()?.error).toMatch(/ambiguous/);
  await act(async () => {
    agentEvents!.onError("Failed to generate response. Please try again.");
    // onError tears the controller down asynchronously; let it settle so the
    // teardown does not leak into the next test.
    await vi.waitFor(() => expect(current.state.connection).toBe("error"));
  });
  expect(current.state.error).toMatch(/failed to generate/i);
  // The precise reason is what inline-voice-controls renders first.
  expect(inlineSession.getSnapshot()?.error).toMatch(/ambiguous/);
  inlineSession.cancel();
  unregister();
});
it("surfaces an error instead of wedging in connecting when the editor capture never responds", async () => {
  vi.useFakeTimers();
  // The editor bridge flush and the git-counts read inside capture are not
  // bounded. A hung capture must not leave the sheet stuck on connecting,
  // where the next tap is silently swallowed.
  const unregister = inlineSession.register("p", {
    capture: () => new Promise(() => {}),
    preview: vi.fn(),
    apply: vi.fn(async () => true),
  });
  await act(async () => root.render(<Harness projectId="p" />));
  await act(async () => current.startInline());
  expect(current.state.connection).toBe("connecting");
  expect(current.state.error).toBeNull();
  expect(current.visible).toBe(true);
  expect(mocks.connect).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(current.state.connection).not.toBe("connecting");
  expect(current.state.error).toMatch(/editor/i);
  expect(current.visible).toBe(true);
  expect(mocks.connect).not.toHaveBeenCalled();
  unregister();
});
it("a single tap shows instructions, a double tap starts hands-free, and a third pauses without dismissing", async () => {
  await act(async () => {
    current.onTouchStart();
    current.onPress();
  });
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(current.visible).toBe(true);
  await act(async () => {
    current.onTouchStart();
    current.onPress();
  });
  expect(mocks.control).toHaveBeenCalledWith("hands-free");
  await act(async () => {
    current.onTouchStart();
    current.onPress();
  });
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.control).toHaveBeenLastCalledWith("stop");
  expect(current.visible).toBe(true);
  expect(current.state.listening).toBe(false);
  await act(async () => current.startHandsFree());
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(current.state.listening).toBe(true);
  await act(async () => current.stop());
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(current.visible).toBe(false);
});
it("long press and release send one turn without counting as a tap", async () => {
  await act(async () => {
    current.onTouchStart();
    current.onLongPress();
  });
  await act(async () => {
    current.onTouchEnd();
    current.onPress();
  });
  expect(mocks.control.mock.calls.map(([action]) => action)).toEqual([
    "start",
    "commit",
  ]);
  expect(current.state.mode).toBe("hold");
});
it("cancels a touch and stops when the dock is hidden or the app backgrounds", async () => {
  await act(async () => {
    current.onTouchStart();
    current.onLongPress();
  });
  await act(async () => current.onTouchCancel());
  expect(mocks.control).toHaveBeenLastCalledWith("cancel");
  await act(async () => root.render(<Harness enabled={false} />));
  expect(mocks.close).toHaveBeenCalledOnce();
  await act(async () => root.render(<Harness />));
  await act(async () => {
    current.onTouchStart();
    current.onLongPress();
  });
  await act(async () => mocks.background?.("background"));
  expect(mocks.close).toHaveBeenCalledTimes(2);
});

it("keeps recording across press deactivation and re-entry until the finger lifts", async () => {
  await act(async () => {
    mocks.button.onTouchStart?.();
    mocks.button.onPressIn?.();
    mocks.button.onLongPress();
  });
  // Pressability deactivates on LEAVE_PRESS_RECT even with the finger down.
  await act(async () =>
    mocks.button.onPressOut?.({ nativeEvent: { touches: [{}] } }),
  );
  expect(current.state.listening).toBe(true);
  expect(mocks.control).toHaveBeenCalledExactlyOnceWith("start");
  await act(async () => mocks.button.onPressIn?.());
  await act(async () => {
    mocks.button.onTouchEnd();
    mocks.button.onPressOut?.({ nativeEvent: { touches: [] } });
    mocks.button.onPress();
  });
  expect(mocks.control.mock.calls.map(([action]) => action)).toEqual([
    "start",
    "commit",
  ]);
  expect(current.state.listening).toBe(false);
  expect(mocks.close).not.toHaveBeenCalled();
});

it("submits on responder release even when the raw touch-end event is missing", async () => {
  await act(async () => {
    mocks.button.onTouchStart();
    mocks.button.onLongPress();
  });
  await act(async () =>
    mocks.button.onPressOut?.({ nativeEvent: { touches: [{}] } }),
  );
  expect(current.state.listening).toBe(true);
  await act(async () =>
    mocks.button.onPressOut?.({ nativeEvent: { touches: [] } }),
  );
  expect(mocks.control.mock.calls.map(([action]) => action)).toEqual([
    "start",
    "commit",
  ]);
  expect(current.state.listening).toBe(false);
  expect(mocks.close).not.toHaveBeenCalled();
});

it("shows immediate press feedback on the neutral inline microphone before starting a voice connection", async () => {
  await act(async () => root.render(<Harness compact />));
  await act(async () => mocks.button.onTouchStart());
  expect(current.pressed).toBe(true);
  expect(mocks.button.className).not.toContain("bg-primary");
  expect(mocks.connect).not.toHaveBeenCalled();
  await act(async () => mocks.button.onTouchEnd());
  expect(current.pressed).toBe(false);
});
it("hides inline controls while retaining a muted room for the next tap", async () => {
  await act(async () => current.startInline());
  await act(async () => current.stop());
  expect(current.visible).toBe(false);
  expect(current.state.listening).toBe(false);
  expect(mocks.control).toHaveBeenLastCalledWith("cancel");
  expect(mocks.close).not.toHaveBeenCalled();
  await act(async () => current.startInline());
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(current.visible).toBe(true);
  expect(current.state.listening).toBe(true);
});

it("ends skipped inline capture and can immediately start another request", async () => {
  const unregister = inlineSession.register("p", {
    capture: async () => ({
      projectId: "p",
      branch: "main",
      openFiles: [],
      activeFile: {
        path: "a.ts",
        documentKey: "doc",
        revision: 1,
        content: "",
        from: 0,
        to: 0,
        focused: false,
      },
    }),
    preview: vi.fn(),
    apply: vi.fn(async () => true),
  });
  await act(async () => root.render(<Harness projectId="p" />));
  await act(async () => current.startInline());
  const request = inlineSession.getSnapshot()!;
  expect(request.mode).toBe("quick-edit");
  await act(async () => {
    inlineSession.receive({ id: request.id, type: "answer" });
  });
  expect(current.state.listening).toBe(false);
  expect(current.visible).toBe(true);
  await act(async () => current.startInline());
  expect(inlineSession.getSnapshot()?.id).not.toBe(request.id);
  expect(current.state.listening).toBe(true);
  await act(async () => current.stop());
  unregister();
});

it("uses text input for accessibility actions when text mode is enabled", async () => {
  mocks.textMode = true;
  await act(async () => root.render(<Harness projectId="p" />));
  await act(async () =>
    mocks.button.onAccessibilityAction({
      nativeEvent: { actionName: "type-command" },
    }),
  );
  expect(commandCenter.getSnapshot().input).toEqual({
    projectId: "p",
    mode: "agent",
  });
  expect(mocks.connect).not.toHaveBeenCalled();
});
