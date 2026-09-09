// @vitest-environment happy-dom
import { act, createElement, useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectFilesSearch } from "@/features/projects/components/project-files-search";

vi.mock("react-native", () => ({
  View: ({ children, ref }: { children?: ReactNode; ref?: Ref<unknown> }) => {
    useImperativeHandle(ref, () => ({ measureInWindow: (callback: (...values: number[]) => void) => callback(320, 600, 56, 56) }));
    return createElement("div", null, children);
  },
  Pressable: ({ children, onPress, accessibilityLabel }: { children?: ReactNode; onPress?: () => void; accessibilityLabel?: string }) =>
    createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
  Modal: ({ children, onShow, onRequestClose }: { children: ReactNode; onShow: () => void; onRequestClose: () => void }) => {
    useEffect(onShow, []);
    return createElement("div", { role: "dialog" }, children,
      createElement("button", { onClick: onRequestClose, "aria-label": "System back" }));
  },
  Keyboard: { dismiss: vi.fn(), addListener: () => ({ remove: () => {} }) },
  Platform: { OS: "ios" },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  StyleSheet: { absoluteFill: {} },
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement("div", null, children) },
  useSharedValue: (value: number) => useRef({ value }).current,
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => true,
  withTiming: (value: number, _config: unknown, complete?: (finished: boolean) => void) => { complete?.(true); return value; },
  cancelAnimation: () => {},
  Easing: { out: (easing: unknown) => easing, cubic: () => {} },
}));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@/components/ui/glass-surface", () => ({ GlassSurface: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/input", () => ({
  Input: ({ ref, value, onChangeText, placeholder, variant }: { ref?: Ref<unknown>; value: string; onChangeText: (text: string) => void; placeholder: string; variant: string }) => {
    useImperativeHandle(ref, () => ({ focus: () => {} }));
    return createElement("input", { value, placeholder, "data-variant": variant,
      onInput: (event) => onChangeText(event.currentTarget.value) });
  },
}));

let container: HTMLDivElement;
let root: Root;
const click = (label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => button!.click());
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(ProjectFilesSearch)));
});
afterEach(() => act(() => root.unmount()));

it("opens an editable ghost search bar and dismisses through the outside-tap surface", () => {
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Search files");
  const input = container.querySelector("input")!;
  expect(input.placeholder).toBe("Search Files");
  expect(input.dataset.variant).toBe("ghost");
  act(() => {
    input.value = "layout.tsx";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(input.value).toBe("layout.tsx");
  click("Dismiss search");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Search files");
  expect(container.querySelector("input")?.value).toBe("layout.tsx");
});

it("supports system dismissal and the explicit close control", () => {
  click("Search files");
  click("System back");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Search files");
  click("Close search");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});
