// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KeyboardAwareView } from "@/components/ui/keyboard-aware-view";

const native = vi.hoisted(() => ({
  height: 956,
  width: 440,
  listeners: new Map<string, Set<(event: unknown) => void>>(),
  frame: undefined as { screenY: number; height: number; width: number; screenX: number } | undefined,
}));
vi.mock("react-native", () => ({
  View: ({ children, style }: { children: ReactNode; style: unknown }) =>
    createElement("div", { style: Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) }, children),
  KeyboardAvoidingView: ({ children, behavior }: { children: ReactNode; behavior: string }) =>
    createElement("div", { "data-android-behavior": behavior }, children),
  StyleSheet: { flatten: (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) },
  useWindowDimensions: () => ({ width: native.width, height: native.height }),
  Keyboard: {
    metrics: () => native.frame,
    scheduleLayoutAnimation: vi.fn(),
    addListener: (event: string, callback: (event: unknown) => void) => {
      const listeners = native.listeners.get(event) ?? new Set();
      listeners.add(callback);
      native.listeners.set(event, listeners);
      return { remove: () => listeners.delete(callback) };
    },
  },
}));

let container: HTMLDivElement;
let root: Root;
const render = (paddingBottom = 0) => act(() => root.render(
  createElement(KeyboardAwareView, { style: { flex: 1, paddingBottom } }, "Input"),
));
const frame = (event: string, screenY: number) => act(() => {
  native.frame = { screenY, screenX: 0, width: native.width, height: native.height - screenY };
  native.listeners.get(event)?.forEach((listener) => listener({
    duration: 250, easing: "keyboard", endCoordinates: native.frame,
  }));
});
const inset = () => Number.parseFloat((container.firstElementChild as HTMLElement).style.paddingBottom || "0");
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("EXPO_OS", "ios");
  native.height = 956;
  native.width = 440;
  native.frame = undefined;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  expect([...native.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  vi.unstubAllEnvs();
});

it.each([0, 62, 96])("keeps the full input visible with native viewport origin %i", (modalOrigin) => {
  // The 62-point case is captured from the iPhone simulator: window height 956,
  // modal height 894, keyboard screenY 636. Fabric reports modal y=0, not 62.
  render();
  frame("keyboardWillShow", 636);
  const viewport = container.firstElementChild as HTMLElement;
  const viewportHeight = Number.parseFloat(viewport.style.maxHeight || String(956 - modalOrigin));
  const inputBottom = modalOrigin + viewportHeight - inset() - 27;
  expect(inputBottom).toBe(609);
  expect(inputBottom).toBeLessThanOrEqual(636);
  frame("keyboardWillChangeFrame", 592);
  expect(modalOrigin + viewportHeight - inset() - 27).toBe(565);
});

it("handles an already-visible keyboard and restores caller padding on dismissal", () => {
  native.frame = { screenX: 0, screenY: 636, width: 440, height: 320 };
  render(12);
  expect(inset()).toBe(332);
  frame("keyboardWillHide", 956);
  expect(inset()).toBe(12);
});

it("updates for rotation and removes the keyboard inset when its frame leaves the window", () => {
  render();
  frame("keyboardWillShow", 636);
  native.height = 440;
  native.width = 956;
  native.frame = { screenX: 0, screenY: 220, width: 956, height: 220 };
  render();
  expect(inset()).toBe(220);
  frame("keyboardDidChangeFrame", 440);
  expect(inset()).toBe(0);
});

it("retains native height avoidance on Android without iOS listeners", () => {
  vi.stubEnv("EXPO_OS", "android");
  render();
  expect(container.querySelector('[data-android-behavior="height"]')).not.toBeNull();
  expect([...native.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
});
