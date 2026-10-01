// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import Module from "node:module";
import WelcomeScreen from "@/app/(auth)/index";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  replace: vi.fn(),
  signIn: vi.fn(),
  appleSignIn: vi.fn(),
  appleAvailable: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: mocks.appleAvailable,
  signInAsync: mocks.appleSignIn,
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
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
    accessibilityLabel,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "button",
      { disabled, onClick: onPress, "aria-label": accessibilityLabel },
      children,
    ),
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
vi.mock("@/features/auth/components/apple-sign-in-logo", () => ({
  AppleSignInLogo: () => createElement("span", { "data-icon": "apple" }),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signIn: { social: mocks.signIn } },
}));
vi.mock("@/lib/utils", () => ({ alert: mocks.alert }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appleAvailable.mockResolvedValue(true);
});

it("offers Continue actions for GitHub, Google, and Apple", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Continue with GitHub",
      "Continue with Google",
      "Continue with Apple",
    ]);
    expect(container.textContent).toContain("Continue with GitHub");
    expect(container.textContent).toContain("Continue with Google");
    expect(container.textContent).toContain("Continue with Apple");
    expect(container.textContent).not.toContain("Coming soon");
    expect(buttons).toHaveLength(3);
    expect(buttons[2]?.disabled).toBe(false);
    expect(
      container.querySelector('[data-icon="google-color"]'),
    ).not.toBeNull();
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

it("shows an alert when social authentication fails", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.signIn.mockResolvedValueOnce({
    error: new Error("Authentication failed"),
  });
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
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(mocks.alert).toHaveBeenCalledWith(
      "Unable to sign in. Please try again.",
    );
    expect(container.textContent).not.toContain(
      "Unable to sign in. Please try again.",
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    assetLoader.mockRestore();
  }
});

it("signs in with Apple's native identity token and first-time name", async () => {
  mocks.appleSignIn.mockResolvedValue({
    identityToken: "apple-id-token",
    fullName: { givenName: "Jane", familyName: "Doe" },
  });
  mocks.signIn.mockResolvedValue({ data: {}, error: null });
  const container = document.createElement("div");
  const root = createRoot(container);
  const loader = Module as unknown as {
    _load: (name: string, ...args: unknown[]) => unknown;
  };
  const originalLoad = loader._load;
  const assetLoader = vi
    .spyOn(loader, "_load")
    .mockImplementation((name, ...args) =>
      name.startsWith("@/assets/") ? 1 : originalLoad(name, ...args),
    );
  try {
    await act(async () => root.render(createElement(WelcomeScreen)));
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>("button")[2]?.click(),
    );
    expect(mocks.appleSignIn).toHaveBeenCalledWith({
      nonce: "00000000-0000-4000-8000-000000000001",
      requestedScopes: [0, 1],
    });
    expect(mocks.signIn).toHaveBeenCalledWith({
      provider: "apple",
      idToken: {
        token: "apple-id-token",
        nonce: "00000000-0000-4000-8000-000000000001",
        user: { name: { firstName: "Jane", lastName: "Doe" } },
      },
    });
    expect(mocks.replace).toHaveBeenCalledWith("/");
  } finally {
    await act(async () => root.unmount());
    assetLoader.mockRestore();
  }
});

it("does not show an error when native Apple sign-in is cancelled", async () => {
  mocks.appleSignIn.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
  const container = document.createElement("div");
  const root = createRoot(container);
  const loader = Module as unknown as {
    _load: (name: string, ...args: unknown[]) => unknown;
  };
  const originalLoad = loader._load;
  const assetLoader = vi
    .spyOn(loader, "_load")
    .mockImplementation((name, ...args) =>
      name.startsWith("@/assets/") ? 1 : originalLoad(name, ...args),
    );
  try {
    await act(async () => root.render(createElement(WelcomeScreen)));
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>("button")[2]?.click(),
    );
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.alert).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    assetLoader.mockRestore();
  }
});
