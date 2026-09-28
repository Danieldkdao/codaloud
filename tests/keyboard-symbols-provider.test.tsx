// @vitest-environment happy-dom
import {
  act,
  createElement,
  use,
  useImperativeHandle,
  type ReactNode,
  type ContextType,
  type Ref,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KeyboardSymbolsProvider } from "@/components/keyboard-symbols-provider";
import { KeyboardSymbolsContext } from "@/hooks/use-keyboard-symbols";

const device = vi.hoisted(() => ({
  OS: "ios",
  glass: true,
  y: 0,
  height: 800,
  frame: { screenY: 500, screenX: 0, width: 390, height: 300 } as
    object | undefined,
}));
vi.mock("react-native", () => ({
  Platform: device,
  useWindowDimensions: () => ({ width: 390, height: 800 }),
  View: ({
    ref,
    children,
    testID,
    style,
  }: {
    ref: Ref<unknown>;
    children: ReactNode;
    testID: string;
    style: object;
  }) => {
    useImperativeHandle(ref, () => ({
      measureInWindow: (done: (...args: number[]) => void) =>
        done(0, device.y, 390, device.height),
    }));
    return createElement("div", { "data-testid": testID, style }, children);
  },
}));
vi.mock("expo-glass-effect", () => ({
  isLiquidGlassAvailable: () => device.glass,
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => device.frame,
}));
vi.mock("react-native-keyboard-controller", () => ({
  KeyboardExtender: ({
    enabled,
    children,
  }: {
    enabled: boolean;
    children: ReactNode;
  }) =>
    // Native enabled only controls attachment; its Yoga node still occupies space.
    createElement(
      "section",
      {
        "data-native-accessory": true,
        "data-enabled": enabled,
        style: { height: 48 },
      },
      enabled ? children : null,
    ),
}));
vi.mock("@/components/keyboard-symbols", () => ({
  KeyboardSymbols: ({ onInsert }: { onInsert: (text: string) => void }) =>
    createElement("button", { onClick: () => onInsert("|") }, "|"),
}));
let host: NonNullable<ContextType<typeof KeyboardSymbolsContext>>;
// Capture the actual context so the host is exercised independently of native input mocks.
const Probe = () => {
  host = use(KeyboardSymbolsContext)!;
  return null;
};
let root: Root;
let container: HTMLDivElement;
const render = () =>
  act(() =>
    root.render(
      createElement(KeyboardSymbolsProvider, {
        fill: true,
        children: createElement(Probe),
      }),
    ),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  device.OS = "ios";
  device.glass = true;
  device.height = 800;
  device.frame = { screenY: 500, height: 300, width: 390, screenX: 0 };
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));
it("switches the native accessory target and ignores a late blur from the previous field", () => {
  render();
  const first = vi.fn();
  const second = vi.fn();
  act(() => host.activate({ id: "first", insert: first }));
  act(() => host.activate({ id: "second", insert: second }));
  act(() => host.deactivate("first"));
  act(() => container.querySelector("button")!.click());
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith("|");
  act(() => host.deactivate("second"));
  act(() => container.querySelector("button")?.click());
  expect(second).toHaveBeenCalledTimes(1);
});
it.each([800, 500])(
  "positions Android symbols above the keyboard in a %s-pixel viewport",
  (height) => {
    device.OS = "android";
    device.height = height;
    render();
    act(() => host.activate({ id: "field", insert: vi.fn() }));
    const bar = container.querySelector<HTMLElement>(
      '[data-testid="keyboard-symbols-host"]',
    )!;
    expect(bar.style.bottom).toBe(`${Math.max(0, height - 500)}px`);
    device.frame = undefined;
    render();
    expect(container.querySelector("button")).toBeNull();
  },
);

it.each([false, true])(
  "keeps the iOS accessory out of screen layout when input focused=%s",
  (focused) => {
    render();
    if (focused) act(() => host.activate({ id: "field", insert: vi.fn() }));
    const accessory = container.querySelector<HTMLElement>(
      "[data-native-accessory]",
    )!;
    let ancestor = accessory.parentElement;
    while (
      ancestor &&
      ancestor !== container &&
      ancestor.style.position !== "absolute"
    ) {
      ancestor = ancestor.parentElement;
    }
    // The native accessory has intrinsic height even while detached. A normal-flow
    // sibling would subtract those 48 points from the full-screen navigator.
    expect(ancestor).not.toBe(container);
    expect(ancestor?.style.position).toBe("absolute");
    expect(parseFloat(ancestor?.style.height ?? "0")).toBeGreaterThanOrEqual(
      48,
    );
  },
);

it("registers iOS symbols before native focus, including between separate input focus events", () => {
  render();
  const enabled = () =>
    container
      .querySelector("[data-native-accessory]")
      ?.getAttribute("data-enabled");
  // Native focus notifications arrive before the JS onFocus handler, including in sheets.
  expect(enabled()).toBe("true");
  act(() => host.activate({ id: "project-name", insert: vi.fn() }));
  act(() => host.deactivate("project-name"));
  expect(enabled()).toBe("true");
  act(() => host.activate({ id: "commit-message", insert: vi.fn() }));
  expect(enabled()).toBe("true");
});

it.each([true, false])(
  "contains symbol scrolling inside the native surface with glass=%s",
  (glass) => {
    device.glass = glass;
    render();
    act(() => host.activate({ id: "search", insert: vi.fn() }));
    const viewport = container.querySelector<HTMLElement>(
      '[data-testid="keyboard-symbols-viewport"]',
    );
    expect(viewport).not.toBeNull();
    expect(viewport!.style.overflow).toBe("hidden");
    expect(viewport!.style.marginLeft).toBe(glass ? "20px" : "0px");
    expect(viewport!.style.marginRight).toBe(glass ? "20px" : "0px");
    expect(viewport!.style.borderRadius).toBe(glass ? "24px" : "0px");
    expect(viewport!.querySelector("button")).not.toBeNull();
  },
);

it("keeps the iOS accessory empty while no opted-in field is focused", () => {
  render();
  // A field that opts out never activates the host; the attachment stays on but an
  // empty viewport collapses it, so it must not be visible.
  const viewport = container.querySelector<HTMLElement>(
    '[data-testid="keyboard-symbols-viewport"]',
  )!;
  expect(viewport.querySelector("button")).toBeNull();
  act(() => host.activate({ id: "search", insert: vi.fn() }));
  expect(viewport.querySelector("button")).not.toBeNull();
  act(() => host.deactivate("search"));
  expect(viewport.querySelector("button")).toBeNull();
});
