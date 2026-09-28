// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ContentSheet,
  type ContentSheetProps,
} from "@/components/ui/content-sheet";

const native = vi.hoisted(() => ({
  background: "modal-background",
  stack: {} as Record<string, any>,
  sheet: {} as Record<string, any>,
  android: {} as Record<string, any>,
  present: vi.fn(),
  close: vi.fn(),
  keyboard: undefined as undefined | { screenY: number; height: number },
  viewport: {} as Record<string, any>,
}));
vi.hoisted(() => vi.stubEnv("EXPO_OS", "ios"));
vi.mock("react-native-screens", () => ({
  ScreenStack: ({ children, ...props }: any) => {
    native.stack = props;
    return children;
  },
  ScreenStackItem: ({ children, ...props }: any) => {
    if (props.stackPresentation !== "formSheet") return null;
    native.sheet = props;
    return createElement("section", { "data-native-sheet": true }, children);
  },
}));
vi.mock("react-native", () => {
  const View = ({ children, testID, style }: any) => {
    if (testID === "native-sheet-content") native.viewport = style;
    return createElement("div", { "data-testid": testID }, children);
  };
  return {
    View,
    ScrollView: View,
    KeyboardAvoidingView: View,
    StyleSheet: { absoluteFill: { position: "absolute", inset: 0 } },
    useWindowDimensions: () => ({ height: 932, width: 430 }),
  };
});
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/hooks/use-theme", () => ({
  useThemeColor: () => native.background,
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => native.keyboard,
}));
vi.mock("@/components/keyboard-symbols-provider", () => ({
  KeyboardSymbolsProvider: ({ children }: any) => children,
}));
vi.mock("@expo/ui/community/bottom-sheet", () => ({
  default: ({ children, ref, ...props }: any) => {
    native.android = props;
    ref.current = { present: native.present, close: native.close };
    return children;
  },
}));
let root: Root;
let container: HTMLDivElement;
const changed = vi.fn();
const dismissed = vi.fn();
const render = async (open = true, props: Partial<ContentSheetProps> = {}) => {
  await act(async () =>
    root.render(
      createElement(ContentSheet, {
        open,
        onOpenChange: changed,
        onDismiss: dismissed,
        backgroundColor: "white",
        scrollable: false,
        children: createElement("input", { defaultValue: "Draft" }),
        ...props,
      }),
    ),
  );
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.background = "modal-background";
  native.stack = {};
  native.sheet = {};
  native.android = {};
  native.keyboard = undefined;
  vi.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it("uses the modal screen background with native sheet geometry and animation", async () => {
  await render();
  expect(native.sheet).toMatchObject({
    stackPresentation: "formSheet",
    sheetAllowedDetents: "fitToContents",
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: false,
    contentStyle: { backgroundColor: "modal-background" },
  });
  expect(native.sheet.sheetCornerRadius).toBeUndefined();
  expect(native.sheet.transitionDuration).toBeUndefined();
  expect(native.sheet.stackAnimation).toBeUndefined();
  expect(container.querySelector('[data-testid="sheet-backdrop"]')).toBeNull();
});
it("opts into the system glass material and restores the solid background", async () => {
  await render(true, { liquidGlass: true });
  expect(native.sheet.contentStyle).toEqual({ backgroundColor: "transparent" });
  await render(true, { liquidGlass: false });
  expect(native.sheet.contentStyle).toEqual({
    backgroundColor: "modal-background",
  });
});
it("updates the solid sheet background when the app theme changes", async () => {
  await render();
  native.background = "dark-modal-background";
  await render();
  expect(native.sheet.contentStyle).toEqual({
    backgroundColor: "dark-modal-background",
  });
});
it("keeps the draft mounted across content rerenders", async () => {
  await render();
  const input = container.querySelector("input")!;
  input.value = "Unsaved correction";
  await render();
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("Unsaved correction");
});
it("bounds long content above the keyboard without expanding to a full-height opaque sheet", async () => {
  native.keyboard = { screenY: 558, height: 374 };
  await render();
  expect(native.viewport.maxHeight).toBeLessThanOrEqual(558 - 62 - 34);
  expect(native.viewport.maxHeight).toBeGreaterThan(300);
  expect(native.viewport.marginBottom).toBe(0);
});
it("reports native gesture dismissal once", async () => {
  await render();
  act(() => native.sheet.onDismissed());
  expect(changed).toHaveBeenCalledExactlyOnceWith(false);
  expect(dismissed).toHaveBeenCalledOnce();
  await render(false);
  act(() => native.stack.onFinishTransitioning());
  expect(dismissed).toHaveBeenCalledOnce();
});
it("waits for the native transition when closed programmatically", async () => {
  await render();
  await render(false);
  expect(dismissed).not.toHaveBeenCalled();
  act(() => native.stack.onFinishTransitioning());
  expect(dismissed).toHaveBeenCalledOnce();
});
it("never lets its empty presenter intercept touches to the underlying screen", async () => {
  await render(false);
  expect(native.stack.pointerEvents).toBe("none");
});
it("does not report a stale closing transition after reopening", async () => {
  await render();
  const staleDismiss = native.sheet.onDismissed;
  await render(false);
  const staleFinish = native.stack.onFinishTransitioning;
  await render();
  act(() => {
    staleDismiss();
    staleFinish();
    native.stack.onFinishTransitioning();
  });
  expect(changed).not.toHaveBeenCalled();
  expect(dismissed).not.toHaveBeenCalled();
});
it("handles repeated reopen and duplicate native events without duplicate dismissal", async () => {
  for (let cycle = 0; cycle < 25; cycle++) {
    await render();
    act(() => {
      native.sheet.onDismissed();
      native.sheet.onDismissed();
    });
    await render(false);
    act(() => native.stack.onFinishTransitioning());
    expect(changed).toHaveBeenCalledTimes(cycle + 1);
    expect(dismissed).toHaveBeenCalledTimes(cycle + 1);
  }
});
it("keeps Android on its existing native bottom sheet", async () => {
  vi.resetModules();
  vi.stubEnv("EXPO_OS", "android");
  try {
    const { ContentSheet: AndroidSheet } =
      await import("@/components/ui/content-sheet");
    const props = {
      open: true,
      onOpenChange: changed,
      onDismiss: dismissed,
      backgroundColor: "white",
      children: "Android form",
    };
    await act(async () => root.render(createElement(AndroidSheet, props)));
    expect(native.present).toHaveBeenCalledOnce();
    expect(native.android.backgroundStyle).toEqual({
      backgroundColor: "white",
    });
    await act(async () =>
      root.render(createElement(AndroidSheet, { ...props, open: false })),
    );
    expect(native.close).toHaveBeenCalledOnce();
  } finally {
    vi.stubEnv("EXPO_OS", "ios");
  }
});
