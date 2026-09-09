// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GitScreen from "@/app/projects/[projectId]/git";

vi.mock("@/features/projects/components/project-workspace-search", () => ({ ProjectWorkspaceSearch: () => null }));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) => createElement("span", null, children);
  return { PText: Text, HeadingText: Text, CodeText: Text };
});
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: 0, right: 0 }) }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  FlatList: ({ data, renderItem, ListHeaderComponent }: {
    data: unknown[]; renderItem: (info: { item: unknown; index: number }) => ReactNode; ListHeaderComponent?: ReactNode;
  }) => createElement("div", null, ListHeaderComponent, data.map((item, index) =>
    createElement("div", { key: index }, renderItem({ item, index })))),
  Pressable: ({ children, onPress, accessibilityLabel }: {
    children?: ReactNode; onPress?: () => void; accessibilityLabel?: string;
  }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
}));
vi.mock("@expo/ui/community/menu", () => ({
  MenuView: ({ children, actions, onPressAction }: {
    children: ReactNode;
    actions: { subactions: { id: string; title: string; state: string }[] }[];
    onPressAction: (event: { nativeEvent: { event: string } }) => void;
  }) => createElement("div", null, children, actions.flatMap((section) => section.subactions.map((option) =>
    createElement("button", {
      key: option.id, "data-branch": option.title, "aria-checked": option.state === "on",
      onClick: () => onPressAction({ nativeEvent: { event: option.id } }),
    }, option.title)))),
}));

let container: HTMLDivElement;
let root: Root;
const selectBranch = (name: string) => {
  const option = container.querySelector<HTMLButtonElement>(`[data-branch="${name}"]`);
  expect(option).not.toBeNull();
  act(() => option!.click());
  expect(container.querySelector(`[data-branch="${name}"]`)?.getAttribute("aria-checked")).toBe("true");
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(GitScreen)));
});
afterEach(() => act(() => root.unmount()));

it("removes the demo label and replaces history when selecting native branch actions", () => {
  expect(container.textContent).not.toContain("Demo history");
  expect(container.textContent).toContain("Polish the dashboard layout");
  selectBranch("feat/project-cards");
  expect(container.textContent).toContain("Add project cards and empty states");
  expect(container.textContent).not.toContain("Polish the dashboard layout");
  expect(container.textContent).not.toContain("Merge branch");
  selectBranch("fix/keyboard-navigation");
  expect(container.textContent).toContain("Restore focus after closing dialogs");
  expect(container.textContent).not.toContain("Add project cards and empty states");
  expect(container.textContent).toContain("Initial commit");
  selectBranch("main");
  expect(container.textContent).toContain("Polish the dashboard layout");
  expect(container.textContent).not.toContain("Restore focus after closing dialogs");
});

it("keeps commit presses inert after changing branches", () => {
  selectBranch("fix/keyboard-navigation");
  const before = container.textContent;
  const commit = container.querySelector<HTMLButtonElement>('[aria-label^="Restore focus after closing dialogs,"]');
  expect(commit).not.toBeNull();
  act(() => commit!.click());
  expect(container.textContent).toBe(before);
});
