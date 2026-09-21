// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Module from "node:module";
import WelcomeScreen from "@/app/(auth)/index";

vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("@/components/ui/image", () => ({ Image: () => null }));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: { children: ReactNode }) =>
    createElement("h1", null, children),
  PText: ({ children }: { children: ReactNode }) =>
    createElement("p", null, children),
}));
vi.mock("@/features/auth/components/social-sign-in-buttons", () => ({
  SocialSignInButtons: () =>
    createElement("div", null, [
      createElement("button", { key: "github" }, "Sign in with GitHub"),
      createElement("button", { key: "google" }, "Sign in with Google"),
      createElement(
        "button",
        { key: "apple", disabled: true },
        "Sign in with Apple · Coming soon",
      ),
    ]),
}));

it("offers the enabled social providers and marks Apple as coming soon", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  const loader = Module as unknown as {
    _load: (name: string, ...args: unknown[]) => unknown;
  };
  const originalLoad = loader._load;
  const assetLoader = vi
    .spyOn(loader, "_load")
    .mockImplementation((name, ...args) =>
      name.startsWith("@/assets/") ? 1 : originalLoad(name, ...args),
    );
  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(createElement(WelcomeScreen));
    });
    expect(container.textContent).toContain("Your voice. Your code.");
    expect(container.textContent).toContain("Sign in with GitHub");
    expect(container.textContent).toContain("Sign in with Google");
    expect(container.textContent).toContain("Sign in with Apple · Coming soon");
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelectorAll("button")[2]?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Your projects and files stay on this device.",
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    assetLoader.mockRestore();
  }
});
