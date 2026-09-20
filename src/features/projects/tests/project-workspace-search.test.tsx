// @vitest-environment happy-dom
import { act, createElement, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Keyboard, Platform, type View } from "react-native";
import { withTiming } from "react-native-reanimated";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectWorkspaceGitSearch } from "@/features/projects/components/project-workspace-git-search";
import { ProjectWorkspaceSearch } from "@/features/projects/components/project-workspace-search";
import { ProjectWorkspaceFileSearch } from "@/features/projects/components/project-workspace-file-search";
import { ProjectWorkspaceFileSearchProvider, useProjectWorkspaceFileSearch } from "@/features/projects/hooks/use-project-workspace-file-search";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ProjectSearchOverlayProvider } from "@/features/projects/components/project-search-overlay";

const workspace = vi.hoisted(() => ({ projectId: "project-one", commitSearch: "", setCommitSearch: vi.fn(), setGitTab: vi.fn() }));
const touches = vi.hoisted(() => ({ claimed: 0, rootTop: 0, rootHeight: 844, back: new Set<() => boolean>() }));
const transparency = vi.hoisted(() => ({ read: vi.fn(), onChange: undefined as ((enabled: boolean) => void) | undefined }));
const switchCommands = vi.hoisted(() => ({ setValue: vi.fn() }));
const keyboardFrame = vi.hoisted(() => ({ current: undefined as { screenY: number; screenX: number; width: number; height: number } | undefined }));
vi.mock("expo-glass-effect", () => ({
  isGlassEffectAPIAvailable: () => true,
  isLiquidGlassAvailable: () => true,
  GlassView: ({ children }: { children?: ReactNode }) => createElement("div", { "data-glass": true }, children),
}));
vi.mock("@/features/projects/hooks/use-project-workspace-branch", () => ({ useProjectWorkspaceBranch: () => workspace }));

vi.mock("react-native", () => ({
  BackHandler: { addEventListener: (_event: string, callback: () => boolean) => {
    touches.back.add(callback);
    return { remove: () => touches.back.delete(callback) };
  } },
  AccessibilityInfo: {
    isReduceTransparencyEnabled: transparency.read,
    addEventListener: (_event: string, callback: (enabled: boolean) => void) => {
      transparency.onChange = callback;
      return { remove: () => { transparency.onChange = undefined; } };
    },
  },
  ScrollView: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Switch: ({ value, onValueChange, accessibilityLabel }: { value: boolean; onValueChange: (value: boolean) => void; accessibilityLabel: string }) => {
    const [native, setNative] = useState<{ value: boolean | null }>({ value: null });
    // Model RN Switch's controlled-value reconciliation, including intermediate commits.
    useLayoutEffect(() => {
      if (native.value !== null && native.value !== value) {
        switchCommands.setValue(accessibilityLabel, value);
      }
    }, [value, native, accessibilityLabel]);
    return createElement("button", { role: "switch", "aria-label": accessibilityLabel, "aria-checked": value,
      onClick: () => {
        onValueChange(!value);
        setNative({ value: !value });
      },
    });
  },
  FlatList: ({ data, renderItem, ListEmptyComponent }: { data: { file: { path: string } }[]; renderItem: (info: { item: unknown }) => ReactNode; ListEmptyComponent: ReactNode }) =>
    createElement("div", null, data.length ? data.map((item) => createElement("div", { key: item.file.path }, renderItem({ item }))) : ListEmptyComponent),
  View: ({ children, ref, className, testID, onLayout, onStartShouldSetResponderCapture, pointerEvents }: {
    children?: ReactNode; ref?: Ref<unknown>; className?: string; testID?: string; onLayout?: () => void;
    onStartShouldSetResponderCapture?: () => boolean; pointerEvents?: string;
  }) => {
    useImperativeHandle(ref, () => ({ measureInWindow: (callback: (...values: number[]) => void) =>
      testID === "project-search-root" ? callback(0, touches.rootTop, 390, touches.rootHeight) : callback(320, 600, 56, 56) }));
    useEffect(() => { onLayout?.(); }, []);
    return createElement("div", { className, "data-testid": testID, "data-pointer-events": pointerEvents,
      onMouseDownCapture: () => { if (onStartShouldSetResponderCapture?.()) touches.claimed++; } }, children);
  },
  Pressable: ({ children, onPress, accessibilityLabel }: { children?: ReactNode; onPress?: () => void; accessibilityLabel?: string }) =>
    createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
  Modal: ({ children, onShow, onRequestClose }: { children: ReactNode; onShow: () => void; onRequestClose: () => void }) => {
    useEffect(onShow, []);
    return createElement("div", { role: "dialog" }, children,
      createElement("button", { onClick: onRequestClose, "aria-label": "System back" }));
  },
  Keyboard: { dismiss: vi.fn(), metrics: () => keyboardFrame.current, addListener: () => ({ remove: () => {} }) },
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
  withTiming: vi.fn((value: number, _config: unknown, complete?: (finished: boolean) => void) => { complete?.(true); return value; }),
  cancelAnimation: () => {},
  Easing: { out: (easing: unknown) => easing, cubic: () => {} },
}));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "shadow" }));
vi.mock("@/features/projects/hooks/use-project-workspace-dock-height", () => ({ useProjectWorkspaceDockHeight: () => ({ dockHeight: 0 }) }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => createElement("span", null, children) }));
vi.mock("@/components/ui/content-sheet", () => ({ ContentSheet: ({ open, children, onOpenChange }: { open: boolean; children: ReactNode; onOpenChange: (open: boolean) => void }) => open ? createElement("div", null, children, createElement("button", { "aria-label": "Dismiss filters", onClick: () => onOpenChange(false) })) : null }));
vi.mock("@/components/ui/input", () => ({
  Input: ({ ref, value, onChangeText, placeholder, variant }: { ref?: Ref<unknown>; value: string; onChangeText: (text: string) => void; placeholder: string; variant: string }) => {
    useImperativeHandle(ref, () => ({ focus: () => {} }));
    return createElement("input", { value, placeholder, "data-variant": variant,
      onInput: (event) => onChangeText(event.currentTarget.value) });
  },
}));

let container: HTMLDivElement;
let root: Root;
const FileSearchScreen = ({ showSearch = true }: { showSearch?: boolean }) => {
  const search = useProjectWorkspaceFileSearch();
  return <>
    <div data-files-screen>{search.isSearching
      ? <span>Search results</span>
      : <span>Original directory</span>}</div>
    <span data-query>{search.query}</span><span data-applied>{search.debouncedQuery}</span><span data-scope>{search.scope}</span>
    <span data-folder-scoped>{String(search.isCurrentFolderScoped)}</span>
    {showSearch && <ProjectWorkspaceFileSearch />}
  </>;
};
const FileSearchWorkspace = () => <ProjectWorkspaceFileSearchProvider><FileSearchScreen /></ProjectWorkspaceFileSearchProvider>;
const click = (label: string) => {
  if (label === "System back") {
    act(() => { for (const callback of [...touches.back].reverse()) if (callback()) break; });
    return;
  }
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => {
    button!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    vi.runAllTicks();
    button!.click();
  });
};
beforeEach(() => {
  transparency.read.mockReset().mockResolvedValue(true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "queueMicrotask"] });
  touches.claimed = 0;
  touches.rootTop = 0;
  touches.rootHeight = 844;
  Platform.OS = "ios";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  const render = root.render.bind(root);
  root.render = (children) => render(<ProjectSearchOverlayProvider>
    {children}<button aria-label="Dismiss search">Outside the search</button>
  </ProjectSearchOverlayProvider>);
  act(() => root.render(createElement(ProjectWorkspaceSearch)));
});
afterEach(() => {
  keyboardFrame.current = undefined;
  act(() => root.unmount());
  vi.useRealTimers();
});

it("opens floating search above an already-visible keyboard without waiting for another show event", () => {
  keyboardFrame.current = { screenY: 480, screenX: 0, width: 390, height: 364 };
  click("Search files");
  // Anchor top 540 + field height 56 + gap 12 - keyboard top 480.
  expect(withTiming).toHaveBeenCalledWith(128, expect.any(Object));
});

it("opens an editable ghost search bar and dismisses through the outside-tap surface", () => {
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
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
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
  click("Search files");
  expect(container.querySelector("input")?.value).toBe("layout.tsx");
});

it("updates local preview results immediately and preserves the draft after dismissal", () => {
  const Preview = () => {
    const [draft, setDraft] = useState("");
    return <>{createElement(ProjectWorkspaceSearch, {
      value: draft,
      onDraftChange: setDraft,
    })}<span data-preview>{draft}</span></>;
  };
  act(() => root.render(createElement(Preview)));
  click("Search files");
  const input = container.querySelector("input")!;
  act(() => { input.value = "project"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.querySelector("[data-preview]")?.textContent).toBe("project");
  click("Dismiss search");
  click("Search files");
  expect(container.querySelector("input")?.value).toBe("project");
  expect(container.querySelector("[data-preview]")?.textContent).toBe("project");
});

it("supports system dismissal without an explicit close control", () => {
  click("Search files");
  expect(container.querySelector('[aria-label="Close search"]')).toBeNull();
  click("System back");
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
  click("Search files");
  click("Dismiss search");
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
});

it("applies file filters immediately and retains selections when search reopens", () => {
  act(() => root.render(createElement(FileSearchWorkspace)));
  typeSearch("project");
  expect(container.querySelector("[data-files-screen]")?.textContent).toBe("Search results");
  expect(container.querySelector("[data-applied]")?.textContent).toBe("");
  expect(container.querySelector("[data-scope]")?.textContent).toBe("all");
  click("Search filters");
  const titleSwitch = () => container.querySelector('[aria-label="File title"]');
  const contentSwitch = () => container.querySelector('[aria-label="File content"]');
  expect(titleSwitch()?.getAttribute("aria-checked")).toBe("false");
  expect(contentSwitch()?.getAttribute("aria-checked")).toBe("false");
  click("File title");
  expect(container.querySelector("[data-scope]")?.textContent).toBe("title");
  click("File content");
  expect(container.querySelector("[data-scope]")?.textContent).toBe("all");
  click("File title");
  expect(container.querySelector("[data-scope]")?.textContent).toBe("content");
  click("Dismiss filters");
  expect(container.querySelector("input")?.value).toBe("project");
  click("Search filters");
  expect(titleSwitch()?.getAttribute("aria-checked")).toBe("false");
  expect(contentSwitch()?.getAttribute("aria-checked")).toBe("true");
  act(() => vi.advanceTimersByTime(1000));
  expect(container.querySelector("[data-applied]")?.textContent).toBe("project");
});

it("does not send a stale value back to either native switch during its first toggle", () => {
  act(() => root.render(<FileSearchWorkspace />));
  click("Search filters");
  click("File title");
  expect(switchCommands.setValue).not.toHaveBeenCalled();
  click("File content");
  expect(switchCommands.setValue).not.toHaveBeenCalled();
  click("File title");
  click("File content");
  expect(switchCommands.setValue).not.toHaveBeenCalled();
  expect(container.querySelector("[data-scope]")?.textContent).toBe("all");
  expect(container.querySelector('[aria-label="File title"]')?.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('[aria-label="File content"]')?.getAttribute("aria-checked")).toBe("false");
  click("Dismiss filters");
  click("Search filters");
  click("File title");
  expect(switchCommands.setValue).not.toHaveBeenCalled();
  expect(container.querySelector("[data-scope]")?.textContent).toBe("title");
});

it("toggles current-folder scoping immediately and retains the selection when search reopens", () => {
  act(() => root.render(<FileSearchWorkspace />));
  click("Search filters");
  const folderSwitch = () => container.querySelector('[aria-label="Current folder"]');
  expect(folderSwitch()?.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector("[data-folder-scoped]")?.textContent).toBe("true");
  click("File title");
  expect(container.querySelector("[data-folder-scoped]")?.textContent).toBe("false");
  click("Current folder");
  expect(folderSwitch()?.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector("[data-folder-scoped]")?.textContent).toBe("true");
  expect(switchCommands.setValue).not.toHaveBeenCalled();
  click("Dismiss filters");
  click("Search filters");
  expect(folderSwitch()?.getAttribute("aria-checked")).toBe("true");
  click("Current folder");
  expect(container.querySelector("[data-folder-scoped]")?.textContent).toBe("false");
  expect(switchCommands.setValue).not.toHaveBeenCalled();
});

it("synchronizes external filter changes while the sheet stays open", () => {
  let updateTitle: (value: boolean) => void = () => { throw new Error("Filters not mounted"); };
  const ExternalFilterControl = () => {
    const { setTitle } = useProjectWorkspaceFileSearch();
    useEffect(() => { updateTitle = setTitle; }, [setTitle]);
    return <FileSearchScreen />;
  };
  act(() => root.render(<ProjectWorkspaceFileSearchProvider><ExternalFilterControl /></ProjectWorkspaceFileSearchProvider>));
  click("Search filters");
  click("File title");
  act(() => updateTitle(false));
  expect(container.querySelector('[aria-label="File title"]')?.getAttribute("aria-checked")).toBe("false");
  act(() => updateTitle(true));
  expect(container.querySelector('[aria-label="File title"]')?.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector("[data-scope]")?.textContent).toBe("title");
});

it("tracks the draft immediately, applies only the final query, and clears results immediately", () => {
  act(() => root.render(createElement(FileSearchWorkspace)));
  typeSearch("pro");
  act(() => vi.advanceTimersByTime(500));
  typeSearch("project");
  expect(container.querySelector("[data-query]")?.textContent).toBe("project");
  act(() => vi.advanceTimersByTime(999));
  expect(container.querySelector("[data-applied]")?.textContent).toBe("");
  act(() => vi.advanceTimersByTime(1));
  expect(container.querySelector("[data-applied]")?.textContent).toBe("project");
  typeSearch("");
  expect(container.querySelector("[data-files-screen]")?.textContent).toBe("Original directory");
  act(() => vi.advanceTimersByTime(1000));
  expect(container.querySelector("[data-applied]")?.textContent).toBe("");
});

it("finishes pending file searches when the input unmounts and restores the draft on return", () => {
  act(() => root.render(<ProjectWorkspaceFileSearchProvider><FileSearchScreen /></ProjectWorkspaceFileSearchProvider>));
  typeSearch("pending");
  act(() => root.render(<ProjectWorkspaceFileSearchProvider><FileSearchScreen showSearch={false} /></ProjectWorkspaceFileSearchProvider>));
  act(() => vi.advanceTimersByTime(1000));
  expect(container.querySelector("[data-applied]")?.textContent).toBe("pending");
  act(() => root.render(<ProjectWorkspaceFileSearchProvider><FileSearchScreen /></ProjectWorkspaceFileSearchProvider>));
  expect(container.querySelector("input")?.value).toBe("pending");
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
  act(() => vi.advanceTimersByTime(1000));
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
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
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
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
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
  for (const dismiss of ["Dismiss search", "System back"]) {
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

it.each([
  { typing: false, reduceTransparency: true },
  { typing: true, reduceTransparency: true },
  { typing: false, reduceTransparency: false },
  { typing: true, reduceTransparency: false },
])("keeps the dock search open when glass availability resolves: %j", async ({ typing, reduceTransparency }) => {
  let resolveTransparency!: (enabled: boolean) => void;
  transparency.read.mockImplementation(() => new Promise<boolean>((resolve) => { resolveTransparency = resolve; }));
  act(() => root.render(<GlassSurface><ProjectWorkspaceSearch /></GlassSurface>));
  click("Search files");
  vi.mocked(Keyboard.dismiss).mockClear();
  if (typing) typeSearch("project");
  const input = container.querySelector("input");
  await act(async () => { resolveTransparency(reduceTransparency); });
  expect(Keyboard.dismiss).not.toHaveBeenCalled();
  expect(container.querySelector('[data-testid="project-search-overlay"]')).not.toBeNull();
  expect(container.querySelector("input")).toBe(input);
  expect(input?.value).toBe(typing ? "project" : "");
});

it("preserves the live file search and filters across glass preference changes", async () => {
  transparency.read.mockResolvedValue(false);
  await act(async () => root.render(
    <ProjectWorkspaceFileSearchProvider><GlassSurface><FileSearchScreen /></GlassSurface></ProjectWorkspaceFileSearchProvider>,
  ));
  const input = typeSearch("project");
  click("Search filters");
  click("File content");
  for (const enabled of [true, false, true]) {
    act(() => transparency.onChange?.(enabled));
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("project");
    expect(container.querySelector('[aria-label="File content"]')?.getAttribute("aria-checked")).toBe("true");
  }
  act(() => vi.advanceTimersByTime(1000));
  expect(container.querySelector("[data-applied]")?.textContent).toBe("project");
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
  click("Dismiss filters");
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
});

it("keeps typing immediate and only applies the final search after a 1000 ms pause", () => {
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
  act(() => vi.advanceTimersByTime(999));
  expect(onSearch).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onSearch).toHaveBeenCalledExactlyOnceWith("ada");
  expect(input.value).toBe("ada");
  typeSearch("");
  expect(input.value).toBe("");
  act(() => vi.advanceTimersByTime(1000));
  expect(onSearch.mock.calls).toEqual([["ada"], [""]]);
});

it("cancels a pending search when the parent resets the value", () => {
  const onChangeText = vi.fn();
  act(() => root.render(createElement(ProjectWorkspaceSearch, { value: "existing", onChangeText })));
  click("Search files");
  typeSearch("pending");
  act(() => root.render(createElement(ProjectWorkspaceSearch, { value: "", onChangeText })));
  expect(container.querySelector("input")?.value).toBe("");
  act(() => vi.advanceTimersByTime(1000));
  expect(onChangeText).not.toHaveBeenCalled();
});

it("cancels pending searches when leaving the component", () => {
  const onChangeText = vi.fn();
  act(() => root.render(createElement(ProjectWorkspaceSearch, { onChangeText })));
  click("Search files");
  typeSearch("pending");
  act(() => root.render(null));
  act(() => vi.advanceTimersByTime(1000));
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
  act(() => vi.advanceTimersByTime(1000));
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
  act(() => vi.advanceTimersByTime(1000));
  expect(workspace.setCommitSearch).not.toHaveBeenCalled();
  click("Search Git");
  expect(container.querySelector("input")?.value).toBe("");
  typeSearch("new project search");
  act(() => vi.advanceTimersByTime(1000));
  expect(workspace.setCommitSearch).toHaveBeenCalledExactlyOnceWith("new project search");
});


it("dismisses search and activates an outside control with the same touch", () => {
  const onPress = vi.fn();
  act(() => root.render(<><ProjectWorkspaceSearch /><button aria-label="Open file" onClick={onPress}>File</button></>));
  click("Search files");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[data-testid="project-search-overlay"]')?.getAttribute("data-pointer-events")).toBe("box-none");
  click("Open file");
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(touches.claimed).toBe(0);
  expect(container.querySelector("input")).toBeNull();
});

it("leaves input and filter touches alone and removes its layer on unmount", () => {
  act(() => root.render(<FileSearchWorkspace />));
  const input = container.querySelector("input")!;
  act(() => { input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); vi.runAllTicks(); });
  expect(container.querySelector("input")).toBe(input);
  click("Search filters");
  click("File content");
  expect(container.querySelector("input")).toBe(input);
  expect(container.querySelector('[aria-label="File content"]')?.getAttribute("aria-checked")).toBe("true");
  expect(touches.claimed).toBe(0);
  act(() => root.render(null));
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
  expect(touches.back.size).toBe(0);
});

it("positions the non-modal search relative to the app root", () => {
  touches.rootTop = 24;
  click("Search files");
  expect(container.querySelector("[data-search-top]")?.getAttribute("data-search-top")).toBe("516");
});


it("keeps file search visible without an overlay and clears the current results", () => {
  act(() => root.render(<FileSearchWorkspace />));
  expect(container.querySelector("input")).not.toBeNull();
  expect(container.querySelector('[data-testid="project-search-overlay"]')).toBeNull();
  typeSearch("project");
  click("Clear file search");
  expect(container.querySelector("input")?.value).toBe("");
  expect(container.querySelector("[data-files-screen]")?.textContent).toBe("Original directory");
});

it("accounts for the native modal offset when placing search above an existing keyboard", () => {
  // Fabric reports modal-local coordinates; the bottom-aligned modal starts 62pt below the window.
  touches.rootHeight = 782;
  keyboardFrame.current = { screenY: 480, screenX: 0, width: 390, height: 364 };
  act(() => root.render(<ProjectSearchOverlayProvider bottomAligned><ProjectWorkspaceSearch /></ProjectSearchOverlayProvider>));
  vi.mocked(withTiming).mockClear();
  click("Search files");
  expect(withTiming).toHaveBeenCalledWith(190, expect.any(Object));
  expect(container.querySelector('[data-search-top="540"]')).not.toBeNull();
});

it("uses Android's measured window coordinates rather than the iOS modal offset", () => {
  Platform.OS = "android";
  touches.rootTop = 24;
  touches.rootHeight = 780;
  keyboardFrame.current = { screenY: 480, screenX: 0, width: 390, height: 364 };
  act(() => root.render(<ProjectSearchOverlayProvider bottomAligned><ProjectWorkspaceSearch /></ProjectSearchOverlayProvider>));
  vi.mocked(withTiming).mockClear();
  click("Search files");
  expect(withTiming).toHaveBeenCalledWith(128, expect.any(Object));
  expect(container.querySelector('[data-search-top="516"]')).not.toBeNull();
});
