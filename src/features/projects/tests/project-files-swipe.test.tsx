// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PressableProps, ViewProps } from "react-native";
import {
  SwipeDirection,
  type SwipeableProps,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { ProjectFilesListItem } from "../components/project-files-list-item";

const mocks = vi.hoisted(() => ({
  touch: {} as ViewProps,
  swipe: {} as SwipeableProps,
  open: vi.fn(),
  directory: vi.fn(),
  confirm: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: (props: ViewProps) => {
    if (props.onTouchStart) mocks.touch = props;
    return createElement("div", null, props.children);
  },
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    disabled,
  }: PressableProps) =>
    createElement(
      "button",
      {
        disabled,
        "aria-label": accessibilityLabel,
        onClick: () => onPress?.({} as never),
      },
      children as ReactNode,
    ),
  ActivityIndicator: () => null,
}));
vi.mock("react-native-reanimated", () => {
  const animation = {
    duration: () => animation,
    delay: () => animation,
    easing: () => animation,
    withInitialValues: () => animation,
    reduceMotion: () => animation,
  };
  return {
    default: {
      View: ({ children }: { children: ReactNode }) =>
        createElement("div", null, children),
    },
    LinearTransition: animation,
    ReduceMotion: { System: "system" },
  };
});
// The glass background is presentation only; this test covers swipe behaviour.
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));

vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  SwipeDirection: { LEFT: "left", RIGHT: "right" },
  default: (props: SwipeableProps) => {
    mocks.swipe = props;
    return createElement(
      "div",
      null,
      props.children,
      props.renderRightActions?.({} as never, {} as never, {} as never),
    );
  },
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, accessibilityLabel }: PressableProps) =>
    createElement(
      "button",
      {
        "aria-label": accessibilityLabel,
        onClick: () => onPress?.({} as never),
      },
      children as ReactNode,
    ),
}));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/project-file-name-row", () => ({
  ProjectFileNameRow: () => createElement("div", null, "Renaming"),
}));
vi.mock("@/lib/utils", () => ({ confirmAction: mocks.confirm }));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const touch = (
  phase: "onTouchStart" | "onTouchMove" | "onTouchCancel",
  x = 200,
  y = 40,
) =>
  act(() =>
    mocks.touch[phase]?.({ nativeEvent: { pageX: x, pageY: y } } as never),
  );
const click = (label: string) =>
  act(() =>
    container
      .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
      .click(),
  );
const render = (isDir = false) =>
  act(() =>
    root.render(
      <ProjectFilesListItem
        file={{ name: "sample", path: "sample", isDir, size: 0 }}
        existingNames={[]}
        onDirectoryPress={mocks.directory}
        onFilePress={mocks.open}
        onUpdate={async () => {}}
        onDelete={mocks.remove}
      />,
    ),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.touch = {};
  container = document.createElement("div");
  root = createRoot(container);
  render();
});
afterEach(() => act(() => root.unmount()));

it.each([false, true])(
  "does not open a file or folder on swipe release, folder=%s",
  (folder) => {
    render(folder);
    touch("onTouchStart");
    touch("onTouchMove", 100);
    act(() => {
      mocks.swipe.onSwipeableWillOpen?.(SwipeDirection.LEFT);
      mocks.swipe.onSwipeableOpen?.(SwipeDirection.LEFT);
    });
    click(`sample, ${folder ? "folder" : "file"}`);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.directory).not.toHaveBeenCalled();
    touch("onTouchStart");
    click(`sample, ${folder ? "folder" : "file"}`);
    expect(folder ? mocks.directory : mocks.open).toHaveBeenCalledOnce();
  },
);
it.each(["Update sample", "Delete sample"])(
  "does not activate %s on release, but allows a fresh tap",
  (label) => {
    touch("onTouchStart");
    touch("onTouchMove", 100);
    click(label);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Renaming");
    touch("onTouchStart");
    click(label);
    if (label.startsWith("Delete"))
      expect(mocks.confirm).toHaveBeenCalledOnce();
    else expect(container.textContent).toContain("Renaming");
  },
);
it("suppresses vertical drags and cancelled touches, but accepts a fresh tap during settling", () => {
  touch("onTouchStart");
  touch("onTouchMove", 200, 80);
  click("sample, file");
  touch("onTouchStart");
  touch("onTouchCancel");
  click("sample, file");
  expect(mocks.open).not.toHaveBeenCalled();
  act(() => mocks.swipe.onSwipeableWillClose?.(SwipeDirection.RIGHT));
  touch("onTouchStart");
  act(() => mocks.swipe.onSwipeableClose?.(SwipeDirection.RIGHT));
  click("sample, file");
  expect(mocks.open).toHaveBeenCalledOnce();
  touch("onTouchStart");
  touch("onTouchMove", 202, 42);
  click("sample, file");
  expect(mocks.open).toHaveBeenCalledTimes(2);
});

it.each(["Update sample", "Delete sample"])(
  "accepts the first %s tap while the previous swipe is snapping",
  (label) => {
    touch("onTouchStart");
    act(() => mocks.swipe.onSwipeableOpenStartDrag?.(SwipeDirection.LEFT));
    act(() => mocks.swipe.onSwipeableWillOpen?.(SwipeDirection.LEFT));
    touch("onTouchStart");
    click(label);
    if (label.startsWith("Delete")) {
      expect(mocks.confirm).toHaveBeenCalledOnce();
      expect(mocks.remove).not.toHaveBeenCalled();
    } else expect(container.textContent).toContain("Renaming");
  },
);
