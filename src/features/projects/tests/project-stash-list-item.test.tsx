// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScrollViewProps, ViewProps, PressableProps } from "react-native";
import { ProjectStashListItem } from "../components/project-stash-list-item";

const mocks = vi.hoisted(() => ({
  scroll: null as (ScrollViewProps & { ref?: import("react").Ref<unknown> }) | null,
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
  Pressable: ({ children, disabled, onPress, accessibilityLabel }: PressableProps) => createElement("button", { disabled, onClick: () => onPress?.({} as never), "aria-label": accessibilityLabel }, typeof children === "function" ? children({ pressed: false, hovered: false }) : children),
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
const visibleDelete = () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Delete stash: Login work"]')].filter((button) => button.closest('[aria-hidden="false"]'));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.scroll = null;
  mocks.remove.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div"); root = createRoot(container); render();
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

it("reveals Delete with native horizontal scrolling in either direction without restoring", () => {
  expect(mocks.scroll?.horizontal).toBe(true);
  const center = mocks.scroll!.contentOffset!.x;
  expect(visibleDelete()).toHaveLength(0);
  scroll(0);
  expect(visibleDelete()).toHaveLength(1);
  scroll(center);
  expect(visibleDelete()).toHaveLength(0);
  scroll(center * 2);
  expect(visibleDelete()).toHaveLength(1);
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("closes the revealed action and blocks repeated deletion until completion", async () => {
  expect(mocks.scroll).not.toBeNull();
  let finish!: () => void;
  mocks.remove.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  scroll(0);
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
  scroll(0); render(true);
  expect(visibleDelete()).toHaveLength(0);
  expect(mocks.scroll!.scrollEnabled).toBe(false);
  expect(mocks.scrollTo).toHaveBeenCalled();
});
