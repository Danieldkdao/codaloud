// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Module from "node:module";
import WelcomeScreen from "@/app/(auth)/index";

const state = vi.hoisted(() => ({ complete: vi.fn(), isCompleting: false, error: null as string | null }));
vi.mock("../hooks/use-onboarding", () => ({ useOnboarding: () => state }));
vi.mock("react-native", () => ({ View: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("@/components/ui/image", () => ({ Image: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: { children: ReactNode }) => createElement("h1", null, children),
  PText: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onPress, loading }: { children: ReactNode; onPress: () => void; loading: boolean }) => createElement("button", { onClick: onPress, disabled: loading }, children) }));

it("offers direct entry without an OAuth choice and keeps storage errors visible", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const originalLoad = loader._load;
  const assetLoader = vi.spyOn(loader, "_load").mockImplementation((name, ...args) =>
    name.startsWith("@/assets/") ? 1 : originalLoad(name, ...args));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => { root.render(createElement(WelcomeScreen)); });
    expect(container.textContent).toContain("Your voice. Your code.");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.textContent).not.toContain("Continue with GitHub");
    await act(async () => { container.querySelector("button")!.click(); });
    expect(state.complete).toHaveBeenCalledTimes(1);
    state.error = "Unable to save your preference on this device.";
    await act(async () => { root.render(createElement(WelcomeScreen)); });
    expect(container.textContent).toContain(state.error);
  } finally {
    await act(async () => { root.unmount(); });
    state.error = null;
    assetLoader.mockRestore();
  }
});
