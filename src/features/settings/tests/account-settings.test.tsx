// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountDangerZone } from "@/features/settings/components/account-danger-zone";
import { LinkedAccounts } from "@/features/settings/components/linked-accounts";
import { UserProfile } from "@/features/settings/components/user-profile";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  linkSocial: vi.fn(),
  listAccounts: vi.fn(),
  deleteUser: vi.fn(),
  wipeLocalAccountData: vi.fn(),
  clearDeletedAccountSession: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
  unlinkAccount: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: ({ children, ...props }: { children: ReactNode }) =>
    createElement("div", props, children),
  TextInput: ({
    onChangeText,
    value,
  }: {
    onChangeText?: (value: string) => void;
    value: string;
  }) =>
    createElement("input", {
      value,
      onInput: (event: { currentTarget: { value: string } }) =>
        onChangeText?.(event.currentTarget.value),
    }),
  Switch: ({
    value,
    onValueChange,
  }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) =>
    createElement("input", {
      type: "checkbox",
      checked: value,
      onChange: (event: { target: { checked: boolean } }) =>
        onValueChange(event.target.checked),
    }),
}));
vi.mock("@/components/ui/content-sheet", () => ({
  ContentSheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? createElement("div", { "data-sheet": true }, children) : null,
}));
vi.mock("@/features/billing/hooks/use-billing-status", () => ({
  useBillingStatus: () => ({
    data: {
      monthlyCredits: 120,
      purchasedCredits: 30,
      managementUrl: null,
    },
    isPending: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/features/billing/revenuecat-client", () => ({
  showCustomerCenter: vi.fn(),
}));
vi.mock("@/features/settings/delete-local-account-data", () => ({
  deleteLocalAccountData: mocks.wipeLocalAccountData,
  clearDeletedAccountSession: mocks.clearDeletedAccountSession,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    className,
    contentClassName,
    contentContainerClassName,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    contentContainerClassName?: string;
    disabled?: boolean;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      {
        className,
        disabled,
        onClick: onPress,
        "data-content-class": contentClassName,
        "data-content-container-class": contentContainerClassName,
      },
      children,
    ),
}));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ className, name }: { className?: string; name: string }) =>
    createElement("span", { className, "data-icon": name }),
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
vi.mock("@/features/auth/components/google-icon", () => ({
  GoogleIcon: () => createElement("span", { "data-icon": "google" }),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    linkSocial: mocks.linkSocial,
    listAccounts: mocks.listAccounts,
    deleteUser: mocks.deleteUser,
    signOut: mocks.signOut,
    unlinkAccount: mocks.unlinkAccount,
  },
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
  mocks.linkSocial.mockResolvedValue({ data: {}, error: null });
  mocks.listAccounts.mockResolvedValue({
    data: [{ id: "github-account", providerId: "github" }],
    error: null,
  });
  mocks.signOut.mockResolvedValue({ data: {}, error: null });
  mocks.deleteUser.mockResolvedValue({ data: {}, error: null });
  mocks.wipeLocalAccountData.mockResolvedValue(undefined);
  mocks.clearDeletedAccountSession.mockResolvedValue(undefined);
  mocks.unlinkAccount.mockResolvedValue({ data: {}, error: null });
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
  expect(container.querySelector("img")?.style.width).toBe("52px");
  expect(container.querySelector("img")?.style.height).toBe("52px");

  await act(async () => root.unmount());
});

it("requires the account email and keeps device data unless explicitly selected", async () => {
  const { container, root } = await render(
    createElement(AccountDangerZone, {
      userId: "user-1",
      email: "ada@example.com",
    }),
  );
  const buttons = Array.from(container.querySelectorAll("button"));

  expect(container.textContent).toContain("Danger zone");
  expect(buttons.map((button) => button.textContent)).toEqual([
    "Sign out",
    "Delete account",
  ]);
  expect(buttons.every((button) => !button.disabled)).toBe(true);
  expect(
    buttons.every(
      (button) =>
        button.dataset.contentContainerClass === "w-full" &&
        button.dataset.contentClass === "w-full justify-center",
    ),
  ).toBe(true);
  expect(
    Array.from(container.querySelectorAll("[data-icon]")).every((icon) =>
      icon.classList.contains("absolute"),
    ),
  ).toBe(true);

  await act(async () => buttons[1]?.click());
  expect(container.textContent).toContain("150 credits");
  expect(container.textContent).toContain("does not cancel");
  const confirm = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Delete my account",
  );
  expect(confirm?.disabled).toBe(true);
  const input = container.querySelector("input:not([type=checkbox])");
  await act(async () => {
    if (input) {
      (input as HTMLInputElement).value = "wrong@example.com";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  expect(confirm?.disabled).toBe(true);
  await act(async () => {
    if (input) {
      (input as HTMLInputElement).value = "ada@example.com";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  expect(confirm?.disabled).toBe(false);
  await act(async () => confirm?.click());
  expect(mocks.deleteUser).toHaveBeenCalledOnce();
  expect(mocks.wipeLocalAccountData).not.toHaveBeenCalled();
  expect(mocks.clearDeletedAccountSession).toHaveBeenCalledOnce();
  expect(mocks.replace).toHaveBeenCalledWith("/");

  await act(async () => root.unmount());
});

it("deletes local data only when the device option is enabled", async () => {
  const { container, root } = await render(
    createElement(AccountDangerZone, {
      userId: "user-1",
      email: "ada@example.com",
    }),
  );
  await act(async () => {
    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete account")
      ?.click();
  });
  const input = container.querySelector("input:not([type=checkbox])");
  const wipe = container.querySelector("input[type=checkbox]");
  await act(async () => {
    (wipe as HTMLInputElement | null)?.click();
    if (input) {
      (input as HTMLInputElement).value = "ada@example.com";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await act(async () => {
    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete my account")
      ?.click();
  });
  expect(mocks.wipeLocalAccountData).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});

it("signs out without deleting the account", async () => {
  const { container, root } = await render(
    createElement(AccountDangerZone, {
      userId: "user-1",
      email: "ada@example.com",
    }),
  );
  const buttons = Array.from(container.querySelectorAll("button"));

  await act(async () => buttons[0]?.click());
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(mocks.deleteUser).not.toHaveBeenCalled();
  expect(mocks.replace).toHaveBeenCalledWith("/");

  await act(async () => root.unmount());
});

it("distinguishes linked sign-in accounts and manages supported providers", async () => {
  const { container, root } = await render(createElement(LinkedAccounts));

  await act(async () => Promise.resolve());

  expect(container.textContent).toContain("Accounts");
  expect(container.textContent).toContain(
    "Use these accounts to sign in to Codaloud.",
  );
  expect(container.textContent).toContain("GoogleNot connectedLink");
  expect(container.textContent).toContain("GitHubConnectedUnlink");
  expect(container.textContent).toContain("AppleNot connectedLink");

  const buttons = Array.from(container.querySelectorAll("button"));
  const googleButton = buttons.find((button) => button.textContent === "Link");
  const githubButton = buttons.find(
    (button) => button.textContent === "Unlink",
  );
  const appleButton = buttons.filter(
    (button) => button.textContent === "Link",
  )[1];

  await act(async () => googleButton?.click());
  expect(mocks.linkSocial).toHaveBeenCalledWith({
    provider: "google",
    callbackURL: "/account",
  });

  await act(async () => githubButton?.click());
  expect(mocks.unlinkAccount).toHaveBeenCalledWith({
    accountId: "github-account",
  });

  await act(async () => appleButton?.click());
  expect(mocks.linkSocial).toHaveBeenCalledWith({
    provider: "apple",
    callbackURL: "/account",
  });

  await act(async () => root.unmount());
});
