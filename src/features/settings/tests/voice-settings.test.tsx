// @vitest-environment happy-dom
import { createRequire } from "node:module";
import {
  act,
  createElement,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEditorPreferences } from "../editor-preferences";
import { voiceAudioSession } from "@/services/livekit/voice-track";
const mocks = vi.hoisted(() => ({
  player: vi.fn(),
  deactivate: vi.fn(),
  platform: { OS: "ios" },
}));
// Metro resolves these bundled assets to numeric IDs on native platforms.
const nativeRequire = createRequire(import.meta.url);
const previousAssetLoader = nativeRequire.extensions[".mp3"];
nativeRequire.extensions[".mp3"] = (module) => {
  module.exports = 1;
};
afterAll(() => {
  if (previousAssetLoader)
    nativeRequire.extensions[".mp3"] = previousAssetLoader;
  else delete nativeRequire.extensions[".mp3"];
});
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://test" }));
vi.mock("expo-audio", () => ({
  createAudioPlayer: mocks.player,
  setIsAudioActiveAsync: mocks.deactivate,
}));
vi.mock("react-native", () => ({
  Platform: mocks.platform,
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  Pressable: ({
    children,
    onPress,
    accessibilityRole,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityRole: string;
    accessibilityLabel: string;
  }) =>
    createElement(
      "button",
      {
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        onClick: onPress,
      },
      children,
    ),
  Switch: ({
    onValueChange,
    value,
    accessibilityLabel,
  }: {
    onValueChange: (value: boolean) => void;
    value: boolean;
    accessibilityLabel: string;
  }) =>
    createElement("button", {
      role: "switch",
      "aria-label": accessibilityLabel,
      onClick: () => onValueChange(!value),
    }),
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  HeadingText: () => null,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("../components/settings-section", () => ({
  SettingsSection: ({ children }: { children?: ReactNode }) =>
    createElement("section", null, children),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "theme" }));
vi.mock("../hooks/use-editor-preferences", () => ({
  useEditorPreferences: () => ({
    ...useSyncExternalStore(preferences.subscribe, preferences.getSnapshot),
    update: preferences.update,
  }),
}));
import { VoiceSettings } from "../components/voice-settings";
let preferences: ReturnType<typeof createEditorPreferences>;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.platform.OS = "ios";
  mocks.player.mockReset();
  mocks.deactivate.mockReset().mockResolvedValue(undefined);
  preferences = createEditorPreferences({
    getItem: async () => null,
    setItem: async () => {},
  });
  await preferences.load();
  voiceAudioSession.set(false);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  act(() => root.unmount());
  await voiceAudioSession.waitForPreviewCleanup();
  voiceAudioSession.set(false);
  vi.useRealTimers();
});
it.each([false, true])(
  "hides and restores the picker without forgetting the chosen voice in card mode %s",
  async (settings) => {
    act(() => root.render(createElement(VoiceSettings, { settings })));
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(5);
    const selected = preferences.getSnapshot().preferences.voiceId;
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[role="switch"][aria-label="Spoken responses"]',
        )!
        .click();
    });
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(preferences.getSnapshot().preferences).toMatchObject({
      speechEnabled: false,
      voiceId: selected,
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[role="switch"][aria-label="Spoken responses"]',
        )!
        .click();
    });
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(5);
  },
);
it("saves a new voice during a conversation without taking over its audio session", async () => {
  voiceAudioSession.set(true);
  act(() => root.render(createElement(VoiceSettings)));
  await act(async () => {
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1].click();
  });
  expect(preferences.getSnapshot().preferences.voiceId).toBe(
    "EXAVITQu4vr4xnSDxMaL",
  );
  expect(mocks.player).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Close it to preview voices");
});

it("a preview finishing just before voice starts cannot deactivate the microphone", async () => {
  vi.useFakeTimers();
  let audioActive = false;
  let finishPreview!: () => void;
  const pause = vi.fn();
  const remove = vi.fn();
  mocks.player.mockImplementation((_source, options) => {
    finishPreview = () => {
      // Expo 57 AudioModule.swift defers session deactivation by 100 ms.
      // Its registry excludes WebRTC, so it can deactivate an active call.
      if (!options?.keepAudioSessionActive)
        setTimeout(() => {
          audioActive = false;
        }, 100);
    };
    return {
      play: () => {
        audioActive = true;
      },
      pause,
      remove,
    };
  });
  act(() => root.render(createElement(VoiceSettings)));
  await act(async () =>
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1].click(),
  );
  expect(mocks.player).toHaveBeenCalledOnce();
  finishPreview();
  act(() => voiceAudioSession.set(true));
  audioActive = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(audioActive).toBe(true);
  expect(remove).toHaveBeenCalledOnce();
  expect(pause).toHaveBeenCalledOnce();
  expect(mocks.deactivate).not.toHaveBeenCalled();
});

it.each(["ios", "android"])(
  "stops an idle preview on %s without disabling future Android playback",
  async (platform) => {
    vi.useFakeTimers();
    mocks.platform.OS = platform;
    const preview = { play: vi.fn(), pause: vi.fn(), remove: vi.fn() };
    mocks.player.mockReturnValue(preview);
    act(() => root.render(createElement(VoiceSettings)));
    await act(async () =>
      container
        .querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]
        .click(),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(preview.pause).toHaveBeenCalledOnce();
    expect(preview.remove).toHaveBeenCalledOnce();
    if (platform === "ios")
      expect(mocks.deactivate).toHaveBeenCalledExactlyOnceWith(false);
    else expect(mocks.deactivate).not.toHaveBeenCalled();
  },
);

it("waits for the previous preview's native release before playing another", async () => {
  let finish!: () => void;
  mocks.deactivate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  mocks.player.mockImplementation(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
  }));
  act(() => root.render(createElement(VoiceSettings)));
  await act(async () =>
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1].click(),
  );
  try {
    await act(async () =>
      container
        .querySelectorAll<HTMLButtonElement>('[role="radio"]')[2]
        .click(),
    );
    expect(mocks.deactivate).toHaveBeenCalledOnce();
    expect(mocks.player).toHaveBeenCalledOnce();
  } finally {
    await act(async () => {
      finish?.();
      await voiceAudioSession.waitForPreviewCleanup();
    });
  }
  expect(mocks.player).toHaveBeenCalledTimes(2);
});
