// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tier: undefined as "free" | "tier_1" | "tier_2" | undefined,
  preferences: {} as Record<string, unknown>,
  update: vi.fn(),
}));

vi.mock("react-native", () => ({
  View: ({
    children,
    pointerEvents,
  }: {
    children: ReactNode;
    pointerEvents?: string;
  }) =>
    createElement("div", { "data-pointer-events": pointerEvents }, children),
  Pressable: ({
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
  Switch: ({
    value,
    disabled,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean;
    disabled?: boolean;
    onValueChange: (value: boolean) => void;
    accessibilityLabel: string;
  }) =>
    createElement("input", {
      type: "checkbox",
      checked: value,
      disabled,
      "aria-label": accessibilityLabel,
      onChange: (event: { target: { checked: boolean } }) =>
        onValueChange(event.target.checked),
    }),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: { children: ReactNode }) =>
    createElement("h2", null, children),
  PText: ({ children }: { children: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    disabled,
    accessibilityLabel,
    onChangeText,
  }: {
    value: string;
    disabled?: boolean;
    accessibilityLabel: string;
    onChangeText: (value: string) => void;
  }) =>
    createElement("textarea", {
      value,
      disabled,
      "aria-label": accessibilityLabel,
      onChange: (event: { target: { value: string } }) =>
        onChangeText(event.target.value),
    }),
}));
vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({
    label,
    disabled,
    trigger,
  }: {
    label: string;
    disabled?: boolean;
    trigger: ReactNode;
  }) =>
    createElement(
      "button",
      { type: "button", disabled, "aria-label": label },
      trigger,
    ),
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  useEditorPreferences: () => ({
    preferences: mocks.preferences,
    update: mocks.update,
    error: null,
  }),
}));
vi.mock("@/features/billing/hooks/use-billing-status", () => ({
  useBillingStatus: () => ({
    data: mocks.tier ? { tier: mocks.tier } : undefined,
  }),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-1" } } }) },
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "green" }));
vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));
vi.mock("@/features/settings/components/git-identity-form", () => ({
  GitIdentityForm: () => null,
}));
vi.mock("@/features/settings/components/voice-settings", () => ({
  VoiceSettings: () => null,
}));
vi.mock("@/features/settings/components/settings-section", () => ({
  SettingsSection: ({ children }: { children: ReactNode }) =>
    createElement("section", null, children),
}));

import { defaultEditorPreferences } from "../constants";
import { EditorSettings } from "../components/editor-settings";

const render = async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(EditorSettings)));
  return { container, root };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tier = undefined;
  mocks.preferences = { ...defaultEditorPreferences };
});

it("keeps Text mode in editor settings and allows switching both ways on Free", async () => {
  mocks.tier = "free";
  const { container, root } = await render();
  const toggle = container.querySelector<HTMLInputElement>(
    '[aria-label="Text mode"]',
  )!;
  expect(toggle).not.toBeNull();
  expect(toggle.disabled).toBe(false);
  await act(async () => toggle.click());
  expect(mocks.update).toHaveBeenLastCalledWith({ textMode: true });
  mocks.preferences.textMode = true;
  await act(async () => root.render(createElement(EditorSettings)));
  await act(async () => toggle.click());
  expect(mocks.update).toHaveBeenLastCalledWith({ textMode: false });
  await act(async () => root.unmount());
});

it("keeps paid settings visible with badges and disabled controls on Free", async () => {
  mocks.tier = "free";
  const { container, root } = await render();
  expect(container.textContent?.match(/Requires a paid plan/g)).toHaveLength(3);
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Sync selected large folders"]',
    )?.disabled,
  ).toBe(true);
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Inline edit model"]',
    )?.disabled,
  ).toBe(true);
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Agent task model"]',
    )?.disabled,
  ).toBe(true);
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="Theme"]')
      ?.disabled,
  ).toBe(false);
  await act(async () => root.unmount());
});

it.each(["tier_1", "tier_2"] as const)(
  "unlocks the paid controls on %s",
  async (tier) => {
    mocks.tier = tier;
    const { container, root } = await render();
    expect(container.textContent).not.toContain("Requires a paid plan");
    const sync = container.querySelector<HTMLInputElement>(
      '[aria-label="Sync selected large folders"]',
    );
    expect(sync?.disabled).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Inline edit model"]',
      )?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Agent task model"]',
      )?.disabled,
    ).toBe(false);
    await act(async () => sync?.click());
    expect(mocks.update).toHaveBeenCalledWith({ allowLargeSync: true });
    await act(async () => root.unmount());
  },
);

it("keeps paid controls locked until billing status is known", async () => {
  const { container, root } = await render();
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Sync selected large folders"]',
    )?.disabled,
  ).toBe(true);
  await act(async () => root.unmount());
});

it("preserves a selected sync list but prevents editing it after a downgrade", async () => {
  mocks.tier = "free";
  mocks.preferences = { ...defaultEditorPreferences, allowLargeSync: true };
  const { container, root } = await render();
  const paths = container.querySelector<HTMLTextAreaElement>(
    '[aria-label="Folders allowed to sync"]',
  );
  expect(paths?.value).toContain("node_modules");
  expect(paths?.disabled).toBe(true);
  await act(async () => root.unmount());
});
