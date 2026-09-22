// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVoiceConversation } from "../hooks/use-voice-conversation";
import { VoiceMicrophone } from "../components/voice-microphone";
const mocks = vi.hoisted(() => ({
  control: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
  background: undefined as undefined | ((state: string) => void),
  button: {} as Record<string, any>,
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
const Harness = ({ enabled = true }: { enabled?: boolean }) => {
  current = useVoiceConversation(enabled, "project");
  return <VoiceMicrophone conversation={current} />;
};
let root: Root;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.control.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue({
    control: mocks.control,
    close: mocks.close,
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
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

it("shows immediate press feedback before starting a voice connection", async () => {
  await act(async () => mocks.button.onTouchStart());
  expect(mocks.button.className).toContain("border-primary-foreground");
  expect(mocks.connect).not.toHaveBeenCalled();
  await act(async () => mocks.button.onTouchEnd());
  expect(mocks.button.className).not.toContain("border-primary-foreground");
});
