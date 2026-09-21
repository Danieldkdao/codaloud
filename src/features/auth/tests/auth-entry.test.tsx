// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Module from "node:module";
import WelcomeScreen from "@/app/(auth)/index";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/ui/image", () => ({ Image: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
  }) =>
    createElement("button", { disabled, onClick: onPress }, children),
}));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name }: { name: string }) =>
    createElement("span", { "data-icon": name }),
}));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: { children: ReactNode }) =>
    createElement("h1", null, children),
  PText: ({ children }: { children: ReactNode }) =>
    createElement("p", null, children),
}));
vi.mock("@/features/auth/components/google-icon", () => ({
  GoogleIcon: () => createElement("span", { "data-icon": "google-color" }),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signIn: { social: mocks.signIn } },
}));

it("offers Continue actions for GitHub, Google, and Apple", async () => {
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
    expect(container.textContent).toContain("Continue with GitHub");
    expect(container.textContent).toContain("Continue with Google");
    expect(container.textContent).toContain("Continue with Apple");
    expect(container.textContent).not.toContain("Coming soon");
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelectorAll("button")[2]?.disabled).toBe(false);
    expect(container.querySelector('[data-icon="google-color"]')).not.toBeNull();
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
