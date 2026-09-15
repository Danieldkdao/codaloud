// @vitest-environment happy-dom
import { act, createElement, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CopyButton, type CopyButtonProps } from "@/components/copy-button";

const mocks = vi.hoisted(() => ({ copy: vi.fn(), alert: vi.fn(), announce: vi.fn(), reducedMotion: false }));
const animation = vi.hoisted(() => ({ version: 0, listeners: new Set<() => void>() }));
vi.mock("expo-clipboard", () => ({ setStringAsync: mocks.copy }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" "), alert: mocks.alert }));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => createElement("span", { "data-icon": name, className }),
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: mocks.announce },
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityState, ref, className, testID }: {
    children: (state: { pressed: boolean }) => ReactNode; onPress: () => void; disabled?: boolean;
    accessibilityLabel?: string; accessibilityState?: { busy?: boolean }; ref?: React.Ref<HTMLButtonElement>; className?: string; testID?: string;
  }) => createElement("button", { ref, onClick: onPress, disabled, "aria-label": accessibilityLabel, "aria-busy": accessibilityState?.busy, className, "data-testid": testID }, children({ pressed: false })),
  Text: ({ children, className }: { children?: ReactNode; className?: string }) => createElement("span", { className }, children),
  View: ({ children, className }: { children?: ReactNode; className?: string }) => createElement("div", { className }, children),
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
}));
vi.mock("react-native-reanimated", async () => {
  const { useState, useSyncExternalStore } = await import("react");
  return {
    ReduceMotion: { System: "system" },
    useReducedMotion: () => mocks.reducedMotion,
    useSharedValue: (initial: number) => useState(() => {
      let value = initial;
      return {
        get value() { return value; },
        set value(next: number) {
          if (value === next) return;
          value = next; animation.version++;
          animation.listeners.forEach((listener) => listener());
        },
      };
    })[0],
    useAnimatedStyle: (style: () => unknown) => style,
    withTiming: (value: number) => value,
    default: {
      View: ({ children, style, className }: { children?: ReactNode; style?: (() => unknown) | object; className?: string }) => {
        useSyncExternalStore((listener) => { animation.listeners.add(listener); return () => { animation.listeners.delete(listener); }; }, () => animation.version);
        return createElement("div", { className, "data-animation": JSON.stringify(typeof style === "function" ? style() : style) }, children);
      },
    },
  };
});

let root: Root;
let container: HTMLDivElement;
const render = (props: Partial<CopyButtonProps> = {}) => act(() => root.render(createElement(CopyButton, {
  copyText: "full commit hash", children: "Copy SHA", accessibilityLabel: "Copy commit SHA", ...props,
})));
const click = async () => { await act(async () => container.querySelector("button")!.click()); };
const advance = async (ms: number) => { await act(async () => vi.advanceTimersByTimeAsync(ms)); };
const successOpacity = () => {
  const element = container.querySelector('[data-icon="check"]')?.closest("[data-animation]");
  return element ? JSON.parse(element.getAttribute("data-animation")!).opacity : 0;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.copy.mockReset().mockResolvedValue(true);
  mocks.reducedMotion = false;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });

it("copies the exact text, shows the green check briefly, and restores the original children", async () => {
  render();
  expect(successOpacity()).toBe(0);
  await click();
  expect(mocks.copy).toHaveBeenCalledWith("full commit hash");
  expect(successOpacity()).toBe(1);
  expect(container.querySelector('[data-icon="check"]')?.className).toContain("text-success-foreground");
  expect(mocks.announce).toHaveBeenCalledWith("Copied to clipboard");
  expect(mocks.alert).not.toHaveBeenCalled();
  await advance(1500);
  expect(successOpacity()).toBe(0);
  expect(container.textContent).toContain("Copy SHA");
});

it("waits for clipboard completion and prevents overlapping writes", async () => {
  let resolve!: (value: boolean) => void;
  mocks.copy.mockImplementation(() => new Promise<boolean>((done) => { resolve = done; }));
  render(); await click(); await click();
  expect(mocks.copy).toHaveBeenCalledOnce();
  expect(successOpacity()).toBe(0);
  await act(async () => resolve(true));
  expect(successOpacity()).toBe(1);
});

it.each([false, new Error("Clipboard unavailable")])("handles unsuccessful copy (%s) without a success check", async (result) => {
  if (result instanceof Error) mocks.copy.mockRejectedValue(result);
  else mocks.copy.mockResolvedValue(result);
  render(); await click();
  expect(successOpacity()).toBe(0);
  expect(mocks.alert).toHaveBeenCalledOnce();
  expect(mocks.announce).not.toHaveBeenCalled();
  expect(container.querySelector("button")?.disabled).toBe(false);
});

it("restarts the feedback timeout on another successful copy", async () => {
  render(); await click(); await advance(1200); await click(); await advance(400);
  expect(successOpacity()).toBe(1);
  await advance(1100);
  expect(successOpacity()).toBe(0);
});

it("preserves button props, ref, press callback, render-prop children, and text styling", async () => {
  const onPress = vi.fn();
  const ref = createRef<React.ComponentRef<typeof CopyButton>>();
  render({ ref, variant: "outline", size: "sm", testID: "copy", textClassName: "font-bold", contentClassName: "gap-3",
    onPress, children: ({ pressed }) => pressed ? "Pressed" : "Copy value" });
  const button = container.querySelector("button")!;
  expect(ref.current).toBe(button);
  expect(button.dataset.testid).toBe("copy");
  expect(button.className).toContain("border-input");
  expect(container.querySelector(".font-bold")?.textContent).toBe("Copy value");
  await click();
  expect(onPress).toHaveBeenCalledOnce();
  expect(mocks.copy).toHaveBeenCalledOnce();
});

it.each([{ disabled: true }, { loading: true }, { accessibilityState: { disabled: true } }])("respects disabled/loading props: %j", async (props) => {
  render(props); await click();
  expect(mocks.copy).not.toHaveBeenCalled();
});

it("resets feedback and ignores a pending result when copyText changes", async () => {
  let resolve!: (value: boolean) => void;
  mocks.copy.mockImplementationOnce(() => new Promise<boolean>((done) => { resolve = done; }));
  render(); await click(); render({ copyText: "another hash" });
  await act(async () => resolve(true));
  expect(successOpacity()).toBe(0);
  expect(mocks.announce).not.toHaveBeenCalled();
  await click();
  expect(mocks.copy).toHaveBeenLastCalledWith("another hash");
  expect(successOpacity()).toBe(1);
  render({ copyText: "third hash" });
  expect(successOpacity()).toBe(0);
});

it("clears feedback timers on unmount and ignores a late clipboard result", async () => {
  render(); await click(); act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  let resolve!: (value: boolean) => void;
  mocks.copy.mockImplementationOnce(() => new Promise<boolean>((done) => { resolve = done; }));
  render(); await click(); act(() => root.render(null));
  await act(async () => resolve(true));
  expect(mocks.announce).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("omits sliding motion when reduced motion is enabled", async () => {
  mocks.reducedMotion = true;
  render(); await click();
  for (const element of container.querySelectorAll("[data-animation]")) {
    expect(JSON.parse(element.getAttribute("data-animation")!).transform ?? []).toEqual([]);
  }
  expect(successOpacity()).toBe(1);
});
