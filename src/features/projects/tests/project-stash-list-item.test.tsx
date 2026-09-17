// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScrollViewProps, ViewProps, PressableProps } from "react-native";
import { ProjectStashListItem } from "../components/project-stash-list-item";

const mocks = vi.hoisted(() => ({
  scroll: null as (ScrollViewProps & { ref?: import("react").Ref<unknown> }) | null,
  row: null as PressableProps | null,
  scrollTo: vi.fn(), select: vi.fn(), remove: vi.fn(),
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  ScrollView: (props: ScrollViewProps & { ref?: import("react").Ref<unknown> }) => {
    mocks.scroll = props;
    useImperativeHandle(props.ref, () => ({ scrollTo: mocks.scrollTo }));
    return createElement("div", null, props.children);
  },
  View: ({ children, accessibilityElementsHidden }: ViewProps) => createElement("div", { "aria-hidden": accessibilityElementsHidden }, children),
  Pressable: (props: PressableProps) => {
    mocks.row = props;
    const { children, disabled, onPress, accessibilityLabel } = props;
    return createElement("button", { disabled, onClick: () => onPress?.({} as never), "aria-label": accessibilityLabel }, typeof children === "function" ? children({ pressed: false, hovered: false }) : children);
  },
  ActivityIndicator: () => createElement("progress"),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled, onPress, accessibilityLabel }: PressableProps) => createElement("button", { disabled, onClick: () => onPress?.({} as never), "aria-label": accessibilityLabel }, typeof children === "function" ? children({ pressed: false, hovered: false }) : children),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => createElement("span", null, children) }));
const stash = { index: 0, sha: "a".repeat(40), message: "Login work", createdAt: "2026-09-17T12:00:00Z" };
let root: Root;
let container: HTMLDivElement;
const render = (disabled = false) => act(() => root.render(<ProjectStashListItem stash={stash} disabled={disabled} onSelect={mocks.select} onDelete={mocks.remove} />));
const scroll = (x: number) => act(() => mocks.scroll!.onScroll?.({ nativeEvent: { contentOffset: { x, y: 0 } } } as never));
const touch = (phase: "onTouchStart" | "onTouchMove" | "onTouchEnd", x = 200, y = 40) =>
  act(() => mocks.scroll![phase]?.({ nativeEvent: { pageX: x, pageY: y } } as never));
const drag = (phase: "onScrollBeginDrag" | "onScrollEndDrag" | "onMomentumScrollBegin" | "onMomentumScrollEnd") =>
  act(() => mocks.scroll![phase]?.({} as never));
const pressRow = () => act(() => mocks.row!.onPress?.({} as never));
const visibleDelete = () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Delete stash: Login work"]')].filter((button) => button.closest('[aria-hidden="false"]'));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.scroll = null;
  mocks.select.mockClear();
  mocks.scrollTo.mockClear();
  mocks.remove.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div"); root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

it("reveals one trailing Delete action only when swiping left", () => {
  expect(mocks.scroll?.horizontal).toBe(true);
  expect(mocks.scroll!.contentOffset!.x).toBe(0);
  expect(mocks.scroll!.snapToOffsets).toEqual([0, 128]);
  expect(container.querySelectorAll('[aria-label="Delete stash: Login work"]')).toHaveLength(1);
  expect(visibleDelete()).toHaveLength(0);
  scroll(128);
  expect(visibleDelete()).toHaveLength(1);
  scroll(0);
  expect(visibleDelete()).toHaveLength(0);
  scroll(-128);
  expect(visibleDelete()).toHaveLength(0);
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it.each([128, 0])("ignores a swipe release press even when the row settles at offset %s", (offset) => {
  touch("onTouchStart");
  drag("onScrollBeginDrag");
  scroll(offset);
  touch("onTouchEnd");
  drag("onScrollEndDrag");
  drag("onMomentumScrollBegin");
  drag("onMomentumScrollEnd");
  pressRow();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();

  touch("onTouchStart");
  touch("onTouchEnd");
  pressRow();
  expect(mocks.select).toHaveBeenCalledOnce();
});

it.each([[160, 40], [240, 40], [200, 90]])("does not restore after moving to %s,%s without a horizontal scroll event", (x, y) => {
  touch("onTouchStart");
  touch("onTouchMove", x, y);
  touch("onTouchEnd", x, y);
  pressRow();
  expect(mocks.select).not.toHaveBeenCalled();
});

it("allows a deliberate tap with small finger movement", () => {
  touch("onTouchStart");
  touch("onTouchMove", 202, 42);
  touch("onTouchEnd", 202, 42);
  pressRow();
  expect(mocks.select).toHaveBeenCalledOnce();
});

it("uses a tap during momentum only to stop the moving row", () => {
  drag("onMomentumScrollBegin");
  touch("onTouchStart");
  drag("onMomentumScrollEnd");
  touch("onTouchEnd");
  pressRow();
  expect(mocks.select).not.toHaveBeenCalled();
  touch("onTouchStart");
  touch("onTouchEnd");
  pressRow();
  expect(mocks.select).toHaveBeenCalledOnce();
});

it("does not delete on swipe release but allows a subsequent tap on Delete", async () => {
  scroll(128);
  touch("onTouchStart");
  touch("onTouchMove", 170);
  touch("onTouchEnd", 170);
  act(() => visibleDelete()[0].click());
  expect(mocks.remove).not.toHaveBeenCalled();
  touch("onTouchStart");
  touch("onTouchEnd");
  await act(async () => visibleDelete()[0].click());
  expect(mocks.remove).toHaveBeenCalledOnce();
});

it("keeps the accessibility delete action available after a swipe", async () => {
  touch("onTouchStart");
  drag("onScrollBeginDrag");
  touch("onTouchEnd");
  drag("onScrollEndDrag");
  await act(async () => mocks.row!.onAccessibilityAction?.({ nativeEvent: { actionName: "delete" } } as never));
  expect(mocks.remove).toHaveBeenCalledOnce();
});
it("closes the revealed action and blocks repeated deletion until completion", async () => {
  expect(mocks.scroll).not.toBeNull();
  let finish!: () => void;
  mocks.remove.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  scroll(128);
  act(() => visibleDelete()[0].click());
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.scrollTo).toHaveBeenCalled();
  expect(mocks.scroll!.scrollEnabled).toBe(false);
  expect([...container.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  await act(async () => finish());
  expect(mocks.scroll!.scrollEnabled).toBe(true);
});
it("closes an open action when another workspace operation disables the row", () => {
  expect(mocks.scroll).not.toBeNull();
  scroll(128); render(true);
  expect(visibleDelete()).toHaveLength(0);
  expect(mocks.scroll!.scrollEnabled).toBe(false);
  expect(mocks.scrollTo).toHaveBeenCalled();
});
