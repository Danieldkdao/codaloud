// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVoiceConversation } from "../hooks/use-voice-conversation";

const native = vi.hoisted(() => ({
  modules: {} as Record<string, unknown>,
  sdkImports: vi.fn(),
}));
vi.mock("react-native", () => ({
  NativeModules: native.modules,
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
}));
// Reproduce the SDK's import-time failure in a development binary without
// WebRTC. No microphone, network, or provider request is involved.
vi.mock("@/services/livekit/voice-native", () => {
  native.sdkImports();
  return {
    get connectNativeVoice() {
      throw new Error(
        "Invariant Violation: `new NativeEventEmitter()` requires a non-null argument.",
      );
    },
  };
});
let current!: ReturnType<typeof useVoiceConversation>;
const Harness = () => {
  current = useVoiceConversation(true, "project");
  return null;
};
let root: Root;
beforeEach(async () => {
  vi.clearAllMocks();
  for (const key of Object.keys(native.modules)) delete native.modules[key];
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it.each(["both", "webrtc", "livekit"])(
  "shows an actionable error before importing the SDK when %s is missing",
  async (missing) => {
    if (missing === "webrtc") native.modules.LivekitReactNativeModule = {};
    if (missing === "livekit") native.modules.WebRTCModule = {};
    await act(async () => current.startHandsFree());
    expect(current.state.connection).toBe("error");
    expect(current.state.error).toMatch(/rebuild.*app/i);
    expect(current.state.error).not.toMatch(/undefined|NativeEventEmitter/);
    expect(native.sdkImports).not.toHaveBeenCalled();
  },
);
