// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectCodeTabs } from "../components/project-code-tabs";
import { ProjectCodeStatus } from "../components/project-code-status";
import { formatProjectEditorTab } from "../lib/formatters";

vi.mock("react-native-reanimated", () => {
  const transition = { duration: () => transition, reduceMotion: () => transition };
  return {
    default: { View: ({ children }: { children?: ReactNode }) => createElement("div", null, children) },
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
  };
});
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState, disabled }: { children: ReactNode; onPress: () => void; accessibilityLabel: string; accessibilityState?: { selected?: boolean }; disabled?: boolean }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-selected": accessibilityState?.selected, disabled }, children),
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
}));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }) }));
vi.mock("@/components/ui/content-sheet", () => ({ ContentSheet: ({ open, children }: { open: boolean; children: ReactNode }) => open ? createElement("div", { role: "dialog" }, children) : null }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => createElement("span", null, children), HeadingText: ({ children }: { children: ReactNode }) => createElement("h2", null, children) }));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "theme-color" }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); });
afterEach(() => act(() => root.unmount()));
const click = (label: string) => act(() => {
  const button = [...container.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label);
  expect(button).toBeDefined(); button!.click();
});

it("formats the extension alongside the name and disambiguates identical filenames by folder", () => {
  expect(formatProjectEditorTab("src/button.tsx", ["src/button.tsx", "src/button.ts"])).toMatchObject({ name: "button", extension: ".tsx", directory: null });
  expect(formatProjectEditorTab("src/app/index.tsx", ["src/app/index.tsx", "src/settings/index.tsx"])).toMatchObject({ name: "index", extension: ".tsx", directory: "app" });
  expect(formatProjectEditorTab(".gitignore", [".gitignore"])).toMatchObject({ name: ".gitignore", extension: "" });
});

it("switches and closes tabs, opens Files, and selects a file from the count sheet", () => {
  const onSelect = vi.fn(); const onClose = vi.fn(); const onOpenFile = vi.fn();
  act(() => root.render(createElement(ProjectCodeTabs, { paths: ["a.ts", "lib/b.ts"], activePath: "a.ts", onSelect, onClose, onOpenFile })));
  click("lib/b.ts"); expect(onSelect).toHaveBeenCalledWith("lib/b.ts");
  click("Close a.ts"); expect(onClose).toHaveBeenCalledWith("a.ts");
  click("Open another file"); expect(onOpenFile).toHaveBeenCalledOnce();
  click("2 files open. Show all files.");
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  click("Switch to lib/b.ts"); expect(onSelect).toHaveBeenLastCalledWith("lib/b.ts");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps new-file navigation available when the last tab is closed", () => {
  const onOpenFile = vi.fn();
  act(() => root.render(createElement(ProjectCodeTabs, { paths: [], activePath: null, onSelect: vi.fn(), onClose: vi.fn(), onOpenFile })));
  click("Open another file"); expect(onOpenFile).toHaveBeenCalledOnce();
});

it("shows real diagnostic counts and exposes Problems and save retry independently", () => {
  const onShowProblems = vi.fn(); const onRetry = vi.fn();
  act(() => root.render(createElement(ProjectCodeStatus, {
    status: { status: "error", message: "Save failed" }, onRetry, onShowProblems,
    analysis: { status: "ready", diagnostics: [{ from: 0, to: 1, message: "Bad type", severity: "error", code: 1 }] },
  })));
  expect(container.querySelector('[data-icon="x-circle"]')).not.toBeNull();
  click("Couldn't save file. Tap to retry."); expect(onRetry).toHaveBeenCalledOnce();
  act(() => [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label")?.includes("error") && !button.getAttribute("aria-label")?.includes("save"))!.click());
  expect(onShowProblems).toHaveBeenCalledOnce();
});
