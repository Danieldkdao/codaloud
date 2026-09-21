// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EditorSettingsScreen } from "@/features/settings/components/editor-settings-screen";
import { SettingsScreen } from "@/features/settings/components/settings-screen";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("react-native", () => ({
  Pressable: ({
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessibilityLabel?: string;
    children: ReactNode;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, onClick: onPress },
      children,
    ),
  Switch: () => null,
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.0.0" } },
}));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children: ReactNode }) =>
    createElement("main", null, children),
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
vi.mock("@/features/settings/components/account-danger-zone", () => ({
  AccountDangerZone: () => null,
}));
vi.mock("@/features/settings/components/appearance-selector", () => ({
  AppearanceSelector: () => null,
}));
vi.mock("@/features/settings/components/editor-settings", () => ({
  EditorSettings: () => createElement("div", null, "Shared editor settings"),
}));
vi.mock("@/features/settings/components/git-identity-form", () => ({
  GitIdentityForm: () => createElement("div", null, "Git author form"),
}));
vi.mock("@/features/settings/components/linked-accounts", () => ({
  LinkedAccounts: () => null,
}));
vi.mock("@/features/settings/components/user-profile", () => ({
  UserProfile: () => null,
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "theme-color" }));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));
vi.mock("@/services/github/components/github-connection", () => ({
  GitHubConnection: () => null,
}));

const render = async (element: ReactNode) => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => root.render(element));

  return { container, root };
};

it("opens the dedicated editor settings screen from Preferences", async () => {
  const { container, root } = await render(createElement(SettingsScreen));
  const editorSettings = container.querySelector<HTMLButtonElement>(
    '[aria-label="Editor Settings"]',
  );

  expect(editorSettings).not.toBeNull();
  expect(editorSettings?.querySelector('[data-icon="code"]')).not.toBeNull();
  expect(
    editorSettings?.querySelector('[data-icon="chevron-right"]'),
  ).not.toBeNull();
  expect(container.textContent).not.toContain("Git author form");

  await act(async () => editorSettings?.click());
  expect(mocks.push).toHaveBeenCalledWith("/editor");

  await act(async () => root.unmount());
});

it("renders the shared controls on the editor settings screen", async () => {
  const { container, root } = await render(createElement(EditorSettingsScreen));

  expect(container.textContent).toContain("Shared editor settings");

  await act(async () => root.unmount());
});
