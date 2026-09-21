// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVoiceConversation } from "../hooks/use-voice-conversation";
const mocks = vi.hoisted(() => ({
  control: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
  background: undefined as undefined | ((state: string) => void),
}));
vi.mock("@/services/livekit/voice-native", () => ({
  connectNativeVoice: mocks.connect,
}));
vi.mock("react-native", () => ({
  NativeModules: { WebRTCModule: {}, LivekitReactNativeModule: {} },
  AppState: {
    addEventListener: (_event: string, callback: (state: string) => void) => {
      mocks.background = callback;
      return { remove: vi.fn() };
    },
  },
}));
let current!: ReturnType<typeof useVoiceConversation>;
const Harness = ({ enabled = true }: { enabled?: boolean }) => {
  current = useVoiceConversation(enabled, "project");
  return null;
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
it("a single tap shows instructions, a double tap starts hands-free, and a third stops", async () => {
  await act(async () => {
    current.onPressIn();
    current.onPress();
  });
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(current.visible).toBe(true);
  await act(async () => {
    current.onPressIn();
    current.onPress();
  });
  expect(mocks.control).toHaveBeenCalledWith("hands-free");
  await act(async () => {
    current.onPressIn();
    current.onPress();
  });
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(current.visible).toBe(false);
});
it("long press and release send one turn without counting as a tap", async () => {
  await act(async () => {
    current.onPressIn();
    current.onLongPress();
  });
  await act(async () => {
    current.onPressOut();
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
    current.onPressIn();
    current.onLongPress();
  });
  await act(async () => current.onTouchCancel());
  expect(mocks.control).toHaveBeenLastCalledWith("cancel");
  await act(async () => root.render(<Harness enabled={false} />));
  expect(mocks.close).toHaveBeenCalledOnce();
  await act(async () => root.render(<Harness />));
  await act(async () => {
    current.onPressIn();
    current.onLongPress();
  });
  await act(async () => mocks.background?.("background"));
  expect(mocks.close).toHaveBeenCalledTimes(2);
});
