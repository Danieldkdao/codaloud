// @vitest-environment happy-dom
import { act, createElement, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import type { View } from "react-native";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectWorkspaceGitSearch } from "@/features/projects/components/project-workspace-git-search";
import { ProjectWorkspaceSearch } from "@/features/projects/components/project-workspace-search";

const workspace = vi.hoisted(() => ({ projectId: "project-one", commitSearch: "", setCommitSearch: vi.fn(), setGitTab: vi.fn() }));
vi.mock("@/features/projects/hooks/use-project-workspace-branch", () => ({ useProjectWorkspaceBranch: () => workspace }));

vi.mock("react-native", () => ({
  View: ({ children, ref, className }: { children?: ReactNode; ref?: Ref<unknown>; className?: string }) => {
    useImperativeHandle(ref, () => ({ measureInWindow: (callback: (...values: number[]) => void) => callback(320, 600, 56, 56) }));
    return createElement("div", { className }, children);
  },
  Pressable: ({ children, onPress, accessibilityLabel }: { children?: ReactNode; onPress?: () => void; accessibilityLabel?: string }) =>
    createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
  Modal: ({ children, onShow, onRequestClose }: { children: ReactNode; onShow: () => void; onRequestClose: () => void }) => {
    useEffect(onShow, []);
    return createElement("div", { role: "dialog" }, children,
      createElement("button", { onClick: onRequestClose, "aria-label": "System back" }));
  },
  Keyboard: { dismiss: vi.fn(), addListener: () => ({ remove: () => {} }) },
  Platform: { OS: "ios" },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  StyleSheet: { absoluteFill: {} },
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children, style }: { children?: ReactNode; style: { top?: number }[] | object }) =>
    createElement("div", { "data-search-top": Array.isArray(style) ? style[0]?.top : undefined }, children) },
  useSharedValue: (value: number) => useRef({ value }).current,
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => true,
  withTiming: (value: number, _config: unknown, complete?: (finished: boolean) => void) => { complete?.(true); return value; },
  cancelAnimation: () => {},
  Easing: { out: (easing: unknown) => easing, cubic: () => {} },
}));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "shadow" }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/input", () => ({
  Input: ({ ref, value, onChangeText, placeholder, variant }: { ref?: Ref<unknown>; value: string; onChangeText: (text: string) => void; placeholder: string; variant: string }) => {
    useImperativeHandle(ref, () => ({ focus: () => {} }));
    return createElement("input", { value, placeholder, "data-variant": variant,
      onInput: (event) => onChangeText(event.currentTarget.value) });
  },
}));

let container: HTMLDivElement;
let root: Root;
const click = (label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => button!.click());
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(ProjectWorkspaceSearch)));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

it("opens an editable ghost search bar and dismisses through the outside-tap surface", () => {
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Search files");
  const input = container.querySelector("input")!;
  expect(input.placeholder).toBe("Search Files");
  expect(input.dataset.variant).toBe("ghost");
  act(() => {
    input.value = "layout.tsx";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(input.value).toBe("layout.tsx");
  click("Dismiss search");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Search files");
  expect(container.querySelector("input")?.value).toBe("layout.tsx");
});

it("supports system dismissal and the explicit close control", () => {
  click("Search files");
  click("System back");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  click("Search files");
  click("Close search");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("supports externally controlled text and updates when workspace state changes", () => {
  const onChangeText = vi.fn();
  act(() => root.render(createElement(ProjectWorkspaceSearch, { value: "existing", onChangeText })));
  click("Search files");
  const input = container.querySelector("input")!;
  expect(input.value).toBe("existing");
  act(() => { input.value = "updated"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(input.value).toBe("updated");
  expect(onChangeText).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(250));
  expect(onChangeText).toHaveBeenCalledExactlyOnceWith("updated");
  act(() => root.render(createElement(ProjectWorkspaceSearch, { value: "new project", onChangeText })));
  expect(input.value).toBe("new project");
});

it("reuses the same editable search and dismissal behavior for commit history", () => {
  act(() => root.render(createElement(ProjectWorkspaceSearch, {
    placeholder: "Search Commits",
    accessibilityLabel: "Search commits",
  })));
  click("Search commits");
  const input = container.querySelector("input")!;
  expect(input.placeholder).toBe("Search Commits");
  expect(input.dataset.variant).toBe("ghost");
  act(() => {
    input.value = "initial commit";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(input.value).toBe("initial commit");
  click("Dismiss search");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});


it("opens Agent search above the dock and dismisses on an outside tap", () => {
  const anchorRef = { current: { measureInWindow: (callback: (...values: number[]) => void) => callback(0, 480, 390, 180) } };
  act(() => root.render(createElement(ProjectWorkspaceSearch, {
    placeholder: "Search Activity",
    accessibilityLabel: "Search activity",
    anchorRef: anchorRef as { current: View },
  })));
  click("Search activity");
  expect(container.querySelector("input")?.placeholder).toBe("Search Activity");
  expect(container.querySelector("[data-search-top]")?.getAttribute("data-search-top")).toBe("420");
  click("Dismiss search");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});


it("keeps a solid card behind search text across repeated openings", () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    click("Search files");
    expect(container.querySelector("input")?.closest(".bg-card")).not.toBeNull();
    click("Dismiss search");
  }
});


it("replaces a supplied anchor and reports closure through each dismissal path", () => {
  const onOpenChange = vi.fn();
  const anchorRef = { current: { measureInWindow: (callback: (...values: number[]) => void) => callback(16, 480, 358, 56) } };
  act(() => root.render(createElement(ProjectWorkspaceSearch, {
    anchorRef: anchorRef as { current: View },
    anchorPlacement: "replace",
    onOpenChange,
  })));
  for (const dismiss of ["Dismiss search", "Close search", "System back"]) {
    click("Search files");
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(container.querySelector("[data-search-top]")?.getAttribute("data-search-top")).toBe("480");
    click(dismiss);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  }
});


const typeSearch = (text: string) => {
  const input = container.querySelector("input")!;
  act(() => { input.value = text; input.dispatchEvent(new Event("input", { bubbles: true })); });
  return input;
};

it("keeps typing immediate and only applies the final search after a 250 ms pause", () => {
  const onSearch = vi.fn();
  const Search = () => {
    const [search, setSearch] = useState("");
    return createElement(ProjectWorkspaceSearch, {
      value: search,
      onChangeText: (text) => { setSearch(text); onSearch(text); },
    });
  };
  act(() => root.render(createElement(Search)));
  click("Search files");
  expect(onSearch).not.toHaveBeenCalled();
  typeSearch("a");
  act(() => vi.advanceTimersByTime(200));
  typeSearch("ad");
  act(() => vi.advanceTimersByTime(200));
  const input = typeSearch("ada");
  expect(input.value).toBe("ada");
  act(() => vi.advanceTimersByTime(249));
  expect(onSearch).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onSearch).toHaveBeenCalledExactlyOnceWith("ada");
  expect(input.value).toBe("ada");
  typeSearch("");
  expect(input.value).toBe("");
  act(() => vi.advanceTimersByTime(250));
  expect(onSearch.mock.calls).toEqual([["ada"], [""]]);
});

it("cancels a pending search when the parent resets the value", () => {
  const onChangeText = vi.fn();
  act(() => root.render(createElement(ProjectWorkspaceSearch, { value: "existing", onChangeText })));
  click("Search files");
  typeSearch("pending");
  act(() => root.render(createElement(ProjectWorkspaceSearch, { value: "", onChangeText })));
  expect(container.querySelector("input")?.value).toBe("");
  act(() => vi.advanceTimersByTime(250));
  expect(onChangeText).not.toHaveBeenCalled();
});

it("cancels pending searches when leaving the component", () => {
  const onChangeText = vi.fn();
  act(() => root.render(createElement(ProjectWorkspaceSearch, { onChangeText })));
  click("Search files");
  typeSearch("pending");
  act(() => root.render(null));
  act(() => vi.advanceTimersByTime(250));
  expect(onChangeText).not.toHaveBeenCalled();
});

it("keeps the pending search when dismissing and reopening the floating input", () => {
  const onChangeText = vi.fn();
  act(() => root.render(createElement(ProjectWorkspaceSearch, { value: "", onChangeText })));
  click("Search files");
  typeSearch("latest");
  click("Dismiss search");
  click("Search files");
  expect(container.querySelector("input")?.value).toBe("latest");
  expect(onChangeText).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(250));
  expect(onChangeText).toHaveBeenCalledExactlyOnceWith("latest");
});


it("discards an unfinished Git search when moving to another project with the same saved search", () => {
  workspace.projectId = "project-one";
  workspace.commitSearch = "";
  workspace.setCommitSearch.mockClear();
  const props = { branchIndicatorRef: { current: null }, onOpenChange: () => {} };
  act(() => root.render(createElement(ProjectWorkspaceGitSearch, props)));
  click("Search Git");
  typeSearch("old project search");
  workspace.projectId = "project-two";
  act(() => root.render(createElement(ProjectWorkspaceGitSearch, props)));
  act(() => vi.advanceTimersByTime(250));
  expect(workspace.setCommitSearch).not.toHaveBeenCalled();
  click("Search Git");
  expect(container.querySelector("input")?.value).toBe("");
  typeSearch("new project search");
  act(() => vi.advanceTimersByTime(250));
  expect(workspace.setCommitSearch).toHaveBeenCalledExactlyOnceWith("new project search");
});
