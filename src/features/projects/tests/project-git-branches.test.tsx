// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, useState, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GitScreen from "@/app/projects/[projectId]/git";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";
import { ProjectWorkspaceBranchContext } from "@/features/projects/contexts/project-workspace-context";
import { demoBranches } from "@/features/projects/data/demo-commits";

let activeTab = "git";
vi.mock("expo-router", () => ({ usePathname: () => `/projects/demo/${activeTab}` }));
vi.mock("expo-router/ui", () => ({
  TabTrigger: ({ children }: { children: ReactNode }) => children,
}));
const Workspace = () => {
  const [branch, setBranch] = useState(demoBranches[0]);
  return createElement(ProjectWorkspaceBranchContext, { value: { branch, setBranch } },
    createElement(GitScreen), createElement(ProjectWorkspaceDock));
};

vi.mock("@/features/projects/hooks/use-workspace-loading-preview", () => ({ useWorkspaceLoadingPreview: () => false }));
vi.mock("@/features/projects/components/project-workspace-search", () => ({ ProjectWorkspaceSearch: ({ accessibilityLabel, onOpenChange }: { accessibilityLabel: string; onOpenChange?: (open: boolean) => void }) => {
  const [open, setOpen] = useState(false);
  return createElement("button", {
    "aria-label": open ? "Dismiss search" : accessibilityLabel,
    onClick: () => { setOpen(!open); onOpenChange?.(!open); },
  });
} }));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@expo/ui/community/bottom-sheet", () => ({
  default: ({ ref, children, onChange, onClose, enablePanDownToClose }: {
    ref: Ref<{ present: () => void; close: () => void }>;
    children: ReactNode;
    onChange?: (index: number) => void;
    onClose?: () => void;
    enablePanDownToClose?: boolean;
  }) => {
    const [open, setOpen] = useState(false);
    const close = () => { setOpen(false); onChange?.(-1); onClose?.(); };
    useImperativeHandle(ref, () => ({
      present: () => { setOpen(true); onChange?.(0); },
      close,
    }));
    if (!open) return null;
    return createElement("div", { role: "dialog", "data-native-sheet": true }, children,
      enablePanDownToClose && createElement("button", { onClick: close, "aria-label": "Swipe down" }),
      enablePanDownToClose && createElement("button", { onClick: close, "aria-label": "System back" }));
  },
  BottomSheetView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({ placeholder, accessibilityLabel }: { placeholder: string; accessibilityLabel: string }) =>
    createElement("input", { placeholder, "aria-label": accessibilityLabel }),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "var(--card)" }));
vi.mock("react-native-svg", () => {
  const Node = ({ children }: { children?: ReactNode }) => createElement("span", null, children);
  return { default: Node, Defs: Node, LinearGradient: Node, Stop: Node, Rect: Node };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) => createElement("span", null, children);
  return { PText: Text, HeadingText: Text, CodeText: Text };
});
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Modal: ({ children, onRequestClose }: { children: ReactNode; onRequestClose: () => void }) =>
    createElement("div", { role: "dialog" }, children, createElement("button", { onClick: onRequestClose, "aria-label": "System back" })),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  StyleSheet: { absoluteFill: {} },
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement("div", { "data-testid": testID }, children),
  FlatList: ({ data, renderItem, ListHeaderComponent }: {
    data: unknown[]; renderItem: (info: { item: unknown; index: number }) => ReactNode; ListHeaderComponent?: ReactNode;
  }) => createElement("div", null, ListHeaderComponent, data.map((item, index) =>
    createElement("div", { key: index }, renderItem({ item, index })))),
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState }: {
    children?: ReactNode; onPress?: () => void; accessibilityLabel?: string; accessibilityState?: { checked?: boolean };
  }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-checked": accessibilityState?.checked }, children),
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
const click = (label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => button!.click());
};
const selectBranch = (name: string) => {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label^="Branch:"]');
  expect(trigger).not.toBeNull();
  act(() => trigger!.click());
  click(name);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[aria-label^="Branch:"]')?.getAttribute("aria-label")).toBe(`Branch: ${name}`);
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe(name);
};

beforeEach(() => {
  activeTab = "git";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(Workspace)));
});
afterEach(() => act(() => root.unmount()));

it("updates the branch note and history when selecting a branch in the sheet", () => {
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


it("shows only the active screen's controls in the lower bar", () => {
  const labels = () => [...container.querySelectorAll("button[aria-label]")]
    .map((button) => button.getAttribute("aria-label"));
  expect(labels()).toContain("Microphone");
  expect(labels()).toContain("Search commits");
  expect(labels()).not.toContain("Undo");
  for (const tab of ["files", "agent", "code"]) {
    activeTab = tab;
    act(() => root.render(createElement(Workspace)));
    expect(labels()).toContain("Microphone");
    expect(container.textContent).not.toContain("Current branch:");
    if (tab === "code") {
      expect(labels()).toEqual(expect.arrayContaining(["Previous file", "Next file", "Undo", "Redo"]));
      expect(labels()).not.toContain("Search activity");
    } else {
      expect(labels()).toContain(tab === "files" ? "Search files" : "Search activity");
      expect(labels()).not.toContain("Previous file");
      expect(labels()).not.toContain("Undo");
      expect(container.querySelector('[data-branch="Folder"]') !== null).toBe(tab === "files");
    }
  }
});


it("dismisses the branch sheet without changing the branch", () => {
  click("Branch: main");
  expect(container.querySelector('[data-native-sheet]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Search branches"]')).not.toBeNull();
  click("Close Branch");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
  click("Branch: main");
  expect(container.querySelector('[aria-label="main"]')?.getAttribute("aria-checked")).toBe("true");
  click("Swipe down");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Branch: main");
  click("System back");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[data-testid="branch-indicator"]')?.textContent).toBe("main");
});


it("replaces the branch pill during search and restores it on dismissal", () => {
  const indicator = () => container.querySelector('[data-testid="branch-indicator"]');
  expect(indicator()?.textContent).toBe("main");
  expect(container.textContent).not.toContain("Current branch:");
  click("Search commits");
  expect(indicator()).toBeNull();
  click("Dismiss search");
  expect(indicator()?.textContent).toBe("main");
});
