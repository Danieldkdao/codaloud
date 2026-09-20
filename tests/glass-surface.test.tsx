// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GlassSurface } from "@/components/ui/glass-surface";

const native = vi.hoisted(() => ({
  available: true,
  reduceTransparency: false,
  onChange: undefined as ((enabled: boolean) => void) | undefined,
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceTransparencyEnabled: async () => native.reduceTransparency,
    addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
      native.onChange = listener;
      return { remove: () => { native.onChange = undefined; } };
    },
  },
  StyleSheet: { absoluteFill: { position: "absolute", inset: 0 } },
  View: ({ children, style, className }: { children?: ReactNode; style?: object; className?: string }) =>
    createElement("div", { style, className }, children),
}));
vi.mock("expo-glass-effect", () => ({
  isGlassEffectAPIAvailable: () => native.available,
  isLiquidGlassAvailable: () => native.available,
  GlassView: ({ style, glassEffectStyle, tintColor }: { style: object; glassEffectStyle: string; tintColor?: string }) =>
    createElement("div", { style, "data-glass": glassEffectStyle, "data-tint": tintColor }),
}));

let root: Root;
let container: HTMLDivElement;
const render = async (borderRadius?: number) => {
  await act(async () => root.render(createElement(GlassSurface, {
    borderRadius,
    children: createElement("input", { defaultValue: "Keep this draft" }),
  })));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.available = true;
  native.reduceTransparency = false;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it.each([24, 28, 36])("keeps the native glass edge visible while containing content at radius %s", async (radius) => {
  await render(radius);
  const glass = container.querySelector<HTMLElement>("[data-glass]")!;
  expect(glass.dataset.glass).toBe("regular");
  expect(glass.dataset.tint).toBeUndefined();
  // Clipping the glass's parent cuts off UIKit's rim/shadow. Only its sibling
  // content viewport should clip horizontally scrolling controls.
  expect(glass.parentElement!.style.overflow).not.toBe("hidden");
  const viewport = container.querySelector("input")!.parentElement!;
  expect(viewport.style.overflow).toBe("hidden");
  expect(viewport.style.borderRadius).toBe(`${radius}px`);
  expect(viewport.contains(glass)).toBe(false);
});

it("preserves the input and draft when transparency changes", async () => {
  await render();
  const input = container.querySelector("input")!;
  input.value = "Unsaved input";
  for (const reduce of [true, false, true]) {
    act(() => native.onChange?.(reduce));
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Unsaved input");
    expect(Boolean(container.querySelector("[data-glass]"))).toBe(!reduce);
  }
});

it.each(["unsupported", "reduced transparency"])("keeps an opaque themed fallback for %s", async (mode) => {
  native.available = mode !== "unsupported";
  native.reduceTransparency = mode === "reduced transparency";
  await render();
  expect(container.querySelector("[data-glass]")).toBeNull();
  expect(container.querySelector(".bg-card.border-border")).not.toBeNull();
});
