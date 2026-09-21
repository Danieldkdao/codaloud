// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountDangerZone } from "@/features/settings/components/account-danger-zone";
import { UserProfile } from "@/features/settings/components/user-profile";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: ({ children, ...props }: { children: ReactNode }) =>
    createElement("div", props, children),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    className,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      { className, disabled, onClick: onPress },
      children,
    ),
}));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name }: { name: string }) =>
    createElement("span", { "data-icon": name }),
}));
vi.mock("@/components/ui/image", () => ({
  Image: ({
    accessibilityLabel,
    source,
    style,
  }: {
    accessibilityLabel?: string;
    source: { default?: { uri?: string } };
    style?: { width?: number; height?: number };
  }) =>
    createElement("img", {
      alt: accessibilityLabel,
      src: source.default?.uri,
      style,
    }),
}));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: { children: ReactNode }) =>
    createElement("h2", null, children),
  PText: ({ children }: { children: ReactNode }) =>
    createElement("p", null, children),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}));
vi.mock("@/lib/utils", () => ({
  alert: mocks.alert,
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

const render = async (element: ReactNode) => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return { container, root };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ data: {}, error: null });
});

it("shows the authenticated user's profile", async () => {
  const { container, root } = await render(
    createElement(UserProfile, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: "https://example.com/ada.png",
    }),
  );

  expect(container.textContent).toContain("Profile");
  expect(container.textContent).toContain("Ada Lovelace");
  expect(container.textContent).toContain("ada@example.com");
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://example.com/ada.png",
  );
  expect(container.querySelector("img")?.style.width).toBe("64px");
  expect(container.querySelector("img")?.style.height).toBe("64px");

  await act(async () => root.unmount());
});

it("signs out while leaving delete account as an inert enabled action", async () => {
  const { container, root } = await render(createElement(AccountDangerZone));
  const buttons = Array.from(container.querySelectorAll("button"));

  expect(container.textContent).toContain("Danger zone");
  expect(buttons.map((button) => button.textContent)).toEqual([
    "Sign out",
    "Delete account",
  ]);
  expect(buttons.every((button) => !button.disabled)).toBe(true);
  expect(
    buttons.every((button) => button.classList.contains("justify-start")),
  ).toBe(true);

  await act(async () => buttons[1]?.click());
  expect(mocks.signOut).not.toHaveBeenCalled();

  await act(async () => buttons[0]?.click());
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(mocks.replace).toHaveBeenCalledWith("/");

  await act(async () => root.unmount());
});
