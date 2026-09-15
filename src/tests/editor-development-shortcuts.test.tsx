// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEditorDevelopmentShortcuts } from "@/hooks/use-editor-development-shortcuts";

const native = vi.hoisted(() => ({
  focused: true,
  platform: "ios",
  available: true,
  getPreferencesAsync: vi.fn(),
  setPreferencesAsync: vi.fn(),
}));
vi.mock("expo", () => ({
  requireOptionalNativeModule: () => native.available ? native : null,
}));
vi.mock("react-native", () => ({ Platform: { get OS() { return native.platform; } } }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useFocusEffect: (effect: () => void | (() => void)) =>
      useEffect(() => native.focused ? effect() : undefined, [effect, native.focused]),
  };
});

let root: Root;
let container: HTMLDivElement;
const Screen = () => { useEditorDevelopmentShortcuts(); return null; };
const render = async (focused = true) => {
  native.focused = focused;
  await act(async () => { root.render(createElement(Screen)); });
};

beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.available = true;
  native.platform = "ios";
  native.getPreferencesAsync.mockReset().mockResolvedValue({ keyCommandsEnabled: true });
  native.setPreferencesAsync.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

it("disables native development shortcuts on focus and restores them on blur", async () => {
  await render();
  expect(native.setPreferencesAsync).toHaveBeenLastCalledWith({ keyCommandsEnabled: false });
  await render(false);
  expect(native.setPreferencesAsync).toHaveBeenLastCalledWith({ keyCommandsEnabled: true });
});

it("serializes delayed focus, cleanup, and refocus so shortcuts stay disabled in the editor", async () => {
  let resolvePreferences!: (value: { keyCommandsEnabled: boolean }) => void;
  native.getPreferencesAsync.mockImplementationOnce(() => new Promise((resolve) => {
    resolvePreferences = resolve;
  }));
  await render();
  await render(false);
  await render();
  await act(async () => { resolvePreferences({ keyCommandsEnabled: true }); });
  expect(native.setPreferencesAsync.mock.calls).toEqual([
    [{ keyCommandsEnabled: false }],
    [{ keyCommandsEnabled: true }],
    [{ keyCommandsEnabled: false }],
  ]);
  await render(false);
  expect(native.setPreferencesAsync).toHaveBeenLastCalledWith({ keyCommandsEnabled: true });
});

it("preserves a developer's already disabled shortcuts", async () => {
  native.getPreferencesAsync.mockResolvedValue({ keyCommandsEnabled: false });
  await render();
  await render(false);
  expect(native.setPreferencesAsync).not.toHaveBeenCalled();
});

it("does nothing when the optional native module is unavailable", async () => {
  native.available = false;
  await render();
  expect(native.getPreferencesAsync).not.toHaveBeenCalled();
});

it("does not alter shortcuts on Android", async () => {
  native.platform = "android";
  await render();
  expect(native.getPreferencesAsync).not.toHaveBeenCalled();
});

it("does not access development preferences in production", async () => {
  vi.stubGlobal("__DEV__", false);
  await render();
  expect(native.getPreferencesAsync).not.toHaveBeenCalled();
});
