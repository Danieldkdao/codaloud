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
    enabled
      ? createElement("section", { "data-native-accessory": true }, children)
      : null,
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
  expect(container.querySelector("button")).toBeNull();
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
