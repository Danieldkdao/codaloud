// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, useLayoutEffect, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FilesLayout from "@/app/projects/[projectId]/files/_layout";
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));

const state = vi.hoisted(() => ({
  dismissTo: vi.fn(), dismissKeyboard: vi.fn(), begin: vi.fn(), setQuery: vi.fn(), busy: false,
  keyboardListeners: new Map<string, Set<(event: unknown) => void>>(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ projectId: "project-one" }),
  useRouter: () => ({ dismissTo: state.dismissTo }),
  Stack: Object.assign(({ children, screenOptions }: { children: ReactNode; screenOptions: { headerRight: () => ReactNode } }) =>
    createElement("div", null, screenOptions.headerRight(), children), { Screen: () => null }),
}));
vi.mock("react-native", async () => {
  const View = ({ children, ref, testID, style, onLayout }: {
    children?: ReactNode; ref?: Ref<unknown>; testID?: string;
    style?: any; onLayout?: (event: any) => void;
  }) => {
    useImperativeHandle(ref, () => ({ measureInWindow: (callback: (...values: number[]) => void) => callback(0, 60, 390, 784) }));
    useLayoutEffect(() => { onLayout?.({ persist() {}, nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 784 } } }); }, []);
    return createElement("div", { "data-testid": testID, style: Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) }, children);
  };
  const Keyboard = {
    dismiss: state.dismissKeyboard, isVisible: () => false, metrics: () => undefined, scheduleLayoutAnimation: vi.fn(),
    addListener: (name: string, listener: (event: unknown) => void) => {
      const listeners = state.keyboardListeners.get(name) ?? new Set();
      listeners.add(listener); state.keyboardListeners.set(name, listeners);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const StyleSheet = { compose: (a: unknown, b: unknown) => [a, b], flatten: (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) };
  const LayoutAnimation = { configureNext: vi.fn(), Types: {} };
  const Platform = { OS: "ios" };
  return {
  View, Platform, StyleSheet, LayoutAnimation,
  KeyboardAvoidingView: View,
  ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel }: { children?: ReactNode; onPress: () => void; accessibilityLabel: string }) =>
    createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children),
  Switch: () => null,
  Keyboard,
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}; });
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "transparent" }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => createElement("button", { onClick: onPress }, children) }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => createElement("span", null, children) }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/input", () => ({ Input: ({ value, onChangeText, accessibilityLabel }: { value: string; onChangeText: (value: string) => void; accessibilityLabel: string }) =>
  createElement("input", { value, "aria-label": accessibilityLabel, onInput: (event) => onChangeText(event.currentTarget.value) }) }));
vi.mock("@/components/ui/glass-surface", () => ({ GlassSurface: ({ children }: { children: ReactNode }) => createElement("div", { "data-glass": true }, children) }));
vi.mock("@/components/ui/content-sheet", () => ({ ContentSheet: ({ open, children }: { open: boolean; children: ReactNode }) => open ? createElement("div", { role: "dialog" }, children) : null }));
vi.mock("@/components/ui/native-select", () => ({ NativeSelect: ({ label, trigger, sections }: {
  label: string; trigger: ReactNode; sections: { options: { label: string; onSelect: () => void }[] }[];
}) => createElement("div", { "aria-label": label }, trigger, sections.flatMap((section) => section.options.map((option) =>
  createElement("button", { key: option.label, onClick: option.onSelect }, option.label)))) }));
vi.mock("@/features/projects/hooks/use-project-workspace-file-creation", () => ({ useProjectWorkspaceFileCreation: () => ({ kind: null, begin: state.begin }) }));
vi.mock("@/features/projects/hooks/use-project-workspace-branch", () => ({ useProjectWorkspaceBranch: () => ({ projectId: "project-one", isWorkspaceBusy: state.busy }) }));
vi.mock("@/features/projects/hooks/use-project-workspace-file-search", () => ({ useProjectWorkspaceFileSearch: () => ({
  query: "", setQuery: state.setQuery, title: false, content: false, currentFolder: false,
  setTitle: vi.fn(), setContent: vi.fn(), setCurrentFolder: vi.fn(),
}) }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubEnv("EXPO_OS", "ios");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.dismissTo.mockClear(); state.dismissKeyboard.mockClear(); state.begin.mockClear(); state.setQuery.mockClear(); state.busy = false;
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(FilesLayout)));
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllEnvs(); });
const click = (label: string) => {
  const button = [...container.querySelectorAll("button")].find((button) => button.textContent === label || button.getAttribute("aria-label") === label);
  expect(button).toBeDefined();
  act(() => button!.click());
};

it("dismisses the whole Files flow back to the existing editor", () => {
  click("Done");
  expect(state.dismissKeyboard).toHaveBeenCalledOnce();
  expect(state.dismissTo).toHaveBeenCalledExactlyOnceWith({ pathname: "/projects/[projectId]/code", params: { projectId: "project-one" } });
});

it("provides glass add controls and persistent search with filters, without a microphone", () => {
  const toolbar = container.querySelector('[data-testid="project-files-toolbar"]');
  expect(toolbar).not.toBeNull();
  expect(toolbar?.querySelector('[data-glass] [aria-label="Add file or folder"]')).not.toBeNull();
  expect(toolbar?.querySelector('[aria-label="Search files"]')).not.toBeNull();
  expect(toolbar?.querySelector('[aria-label="Microphone"]')).toBeNull();
  click("File"); click("Folder");
  expect(state.begin.mock.calls).toEqual([["file"], ["folder"]]);
  expect(state.setQuery.mock.calls).toEqual([[""], [""]]);
  expect(state.dismissTo).toHaveBeenLastCalledWith({ pathname: "/projects/[projectId]/files", params: { projectId: "project-one" } });
  const input = toolbar!.querySelector("input")!;
  act(() => { input.value = "example"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(state.setQuery).toHaveBeenCalledWith("example");
  click("Search filters");
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Current folder");
});

it("retains the existing creation guard during a workspace operation", () => {
  state.busy = true;
  act(() => root.render(createElement(FilesLayout)));
  click("File");
  expect(state.begin).not.toHaveBeenCalled();
  expect(state.dismissTo).not.toHaveBeenCalled();
});

it("keeps the entire search input above a keyboard whose frame grows after opening", async () => {
  const keyboardFrame = async (name: string, screenY: number) => {
    await act(async () => {
      state.keyboardListeners.get(name)?.forEach((listener) => listener({
        duration: 250, easing: "keyboard",
        endCoordinates: { screenX: 0, screenY, width: 390, height: 844 - screenY },
      }));
    });
  };
  const inputBottom = () => {
    const boundedView = [...container.querySelectorAll<HTMLElement>("div")].find((view) => view.style.maxHeight !== "");
    if (boundedView) return 60 + Number.parseFloat(boundedView.style.maxHeight) - 34;
    const avoidingView = [...container.querySelectorAll<HTMLElement>("div")].find((view) => view.style.paddingBottom !== "");
    return 844 - Number.parseFloat(avoidingView?.style.paddingBottom || "0") - 34;
  };
  await keyboardFrame("keyboardWillShow", 544);
  expect(inputBottom()).toBeLessThanOrEqual(544);
  await keyboardFrame("keyboardWillChangeFrame", 480);
  expect(inputBottom()).toBeLessThanOrEqual(480);
});
