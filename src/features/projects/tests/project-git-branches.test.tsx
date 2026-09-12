// @vitest-environment happy-dom
import { ProjectWorkspaceDockHeightProvider } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { ProjectWorkspaceFileCreationProvider } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { act, createElement, useImperativeHandle, useState, useRef, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectChangesPanel } from "@/features/projects/components/project-changes-panel";
import GitScreen from "@/app/projects/[projectId]/git";
import { ProjectWorkspaceDock } from "@/features/projects/components/project-workspace-dock";
import { ProjectWorkspaceBranchProvider } from "@/features/projects/hooks/use-project-workspace-branch";

let activeTab = "git";
const switchTab = vi.fn((name: string) => { activeTab = name; });
vi.mock("expo-router", () => ({ usePathname: () => `/projects/demo/${activeTab}` }));
vi.mock("expo-router/ui", () => ({
  TabTrigger: ({ children }: { children: ReactNode }) => children,
  useTabTrigger: () => ({ switchTab }),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
    createElement("div", { style: Object.assign({}, ...([style].flat().filter(Boolean) as object[])) }, children) },
  ReduceMotion: { System: "system" },
  useSharedValue: (value: number) => useRef({ value }).current,
  useAnimatedStyle: (callback: () => object) => callback(),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, disabled, accessibilityLabel }: { children: ReactNode; onPress?: () => void; disabled?: boolean; accessibilityLabel?: string }) =>
    createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel }, children),
}));
vi.mock("@expo/vector-icons", () => ({ Feather: {}, Ionicons: {} }));
const Workspace = () => (
  <ProjectWorkspaceDockHeightProvider>
    <ProjectWorkspaceBranchProvider>
      <GitScreen />
      <ProjectWorkspaceFileCreationProvider projectId="demo">
        <ProjectWorkspaceDock />
      </ProjectWorkspaceFileCreationProvider>
    </ProjectWorkspaceBranchProvider>
  </ProjectWorkspaceDockHeightProvider>
);

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
  Input: ({ placeholder, accessibilityLabel, value, onChangeText }: { placeholder: string; accessibilityLabel: string; value?: string; onChangeText?: (value: string) => void }) =>
    createElement("input", { placeholder, "aria-label": accessibilityLabel, value, onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value) }),
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
  Keyboard: { dismiss: vi.fn() },
  PixelRatio: { get: () => 3 },
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Modal: ({ children, onRequestClose }: { children: ReactNode; onRequestClose: () => void }) =>
    createElement("div", { role: "dialog" }, children, createElement("button", { onClick: onRequestClose, "aria-label": "System back" })),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  StyleSheet: { absoluteFill: {} },
  View: ({ children, testID, accessibilityLabel }: { children?: ReactNode; testID?: string; accessibilityLabel?: string }) => createElement("div", { "data-testid": testID, "aria-label": accessibilityLabel }, children),
  FlatList: ({ data, renderItem, ListHeaderComponent }: {
    data: unknown[]; renderItem: (info: { item: unknown; index: number }) => ReactNode; ListHeaderComponent?: ReactNode;
  }) => createElement("div", null, ListHeaderComponent, data.map((item, index) =>
    createElement("div", { key: index }, renderItem({ item, index })))),
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState }: {
    children?: ReactNode; onPress?: () => void; accessibilityLabel?: string; accessibilityState?: { checked?: boolean | "mixed"; selected?: boolean };
  }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-checked": accessibilityState?.checked, "aria-selected": accessibilityState?.selected }, children),
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
  switchTab.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(Workspace)));
});
afterEach(() => act(() => root.unmount()));

it("switches workspace sections through the menu and reflects the active route", () => {
  for (const [name, label] of [["files", "Files"], ["code", "Code"], ["agent", "Agent"], ["git", "Git"]]) {
    const option = container.querySelector<HTMLButtonElement>(`[data-branch="${label}"]`);
    expect(option).not.toBeNull();
    act(() => option!.click());
    expect(switchTab).toHaveBeenLastCalledWith(name, { resetOnFocus: false });
    act(() => root.render(createElement(Workspace)));
    expect(container.querySelector(`[aria-label="Workspace: ${label}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-branch="${label}"]`)?.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelectorAll('[data-branch][aria-checked="true"]')).toHaveLength(1);
  }
});

it("updates the branch note and history when selecting a branch in the sheet", () => {
  click("Commit History");
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
  click("Commit History");
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
  expect(labels()).toContain("Search Git");
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
  click("Search Git");
  expect(indicator()).toBeNull();
  click("Dismiss search");
  expect(indicator()?.textContent).toBe("main");
});


it("shows changes immediately and keeps tracked and untracked selections without committing", () => {
  expect(container.querySelector('[aria-label="Changes"]')?.getAttribute("aria-selected")).toBe("true");
  expect(container.textContent).not.toContain("No uncommitted changes");
  expect(container.textContent).not.toMatch(/demo|preview/i);
  expect(container.querySelector('[aria-label="Show empty state"]')).toBeNull();
  expect(container.querySelector('[aria-label="Commit message"]')).not.toBeNull();
  const checked = (label: string) => container.querySelector(`[aria-label="${label}"]`)?.getAttribute("aria-checked");
  expect(checked("Select all changes")).toBe("false");
  click("Select tracked changes");
  expect(checked("Select tracked changes")).toBe("true");
  expect(checked("Select untracked changes")).toBe("false");
  expect(checked("Select all changes")).toBe("mixed");
  click("Select all changes");
  expect(checked("Select untracked changes")).toBe("true");
  click("Include src/app/projects/[projectId]/git.tsx");
  expect(checked("Select tracked changes")).toBe("mixed");
  click("Commit History");
  click("Changes");
  expect(checked("Select tracked changes")).toBe("mixed");
  const commit = container.querySelector<HTMLButtonElement>('[aria-label="Commit selected changes"]');
  expect(commit?.disabled).toBe(true);
  const before = container.textContent;
  act(() => commit!.click());
  expect(container.textContent).toBe(before);
});

it("renders the empty state from an empty changes list", () => {
  act(() => root.render(createElement(ProjectWorkspaceDockHeightProvider, null,
    createElement(ProjectChangesPanel, { changes: [] }))));
  expect(container.textContent).toContain("No uncommitted changes");
  expect(container.querySelector('[aria-label="Commit message"]')).toBeNull();
  expect(container.textContent).not.toMatch(/demo|preview/i);
  expect(container.querySelector('[aria-label="Show empty state"]')).toBeNull();
});
