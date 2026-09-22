// @vitest-environment happy-dom
import {
  act,
  createElement,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEditorPreferences } from "../editor-preferences";
import { voiceAudioSession } from "@/services/livekit/voice-track";
const mocks = vi.hoisted(() => ({ player: vi.fn() }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://test" }));
vi.mock("expo-audio", () => ({ createAudioPlayer: mocks.player }));
vi.mock("react-native", () => ({
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
  mocks.player.mockClear();
  preferences = createEditorPreferences({
    getItem: async () => null,
    setItem: async () => {},
  });
  await preferences.load();
  voiceAudioSession.set(false);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  voiceAudioSession.set(false);
});
it.each([false, true])(
  "hides and restores the picker without forgetting the chosen voice in card mode %s",
  async (settings) => {
    act(() => root.render(createElement(VoiceSettings, { settings })));
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(5);
    const selected = preferences.getSnapshot().preferences.voiceId;
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    });
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(preferences.getSnapshot().preferences).toMatchObject({
      speechEnabled: false,
      voiceId: selected,
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
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
