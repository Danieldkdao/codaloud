// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScrollViewProps } from "react-native";
import { ScrollFadeScrollView } from "@/components/ui/scroll-fade-scroll-view";

let scrollProps: ScrollViewProps;
const mocks = vi.hoisted(() => ({
  color: "light-card",
  stops: [] as string[],
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => mocks.color }));
vi.mock("@react-native-masked-view/masked-view", () => ({
  default: ({ children, maskElement, androidRenderingMode, style }: any) =>
    createElement(
      "section",
      {
        style: Object.assign({}, ...style.flat()),
        "data-testid": "alpha-mask",
        "data-rendering-mode": androidRenderingMode,
      },
      createElement("aside", { "data-testid": "mask-element" }, maskElement),
      createElement("main", { "data-testid": "masked-content" }, children),
    ),
}));
vi.mock("react-native-svg", () => {
  const Node = ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children);
  return {
    default: Node,
    Defs: Node,
    LinearGradient: Node,
    Rect: Node,
    Stop: ({ stopColor, stopOpacity, offset }: any) => {
      mocks.stops.push(stopColor);
      return createElement("span", {
        "data-testid":
          offset === "0%"
            ? "scroll-fade-top"
            : offset === "100%"
              ? "scroll-fade-bottom"
              : undefined,
        "data-opacity": stopOpacity,
        "data-offset": offset,
      });
    },
  };
});
vi.mock("react-native", () => ({
  View: ({
    children,
    testID,
    style,
    pointerEvents,
    accessibilityElementsHidden,
  }: any) =>
    createElement(
      "div",
      {
        "data-testid": testID,
        style: Array.isArray(style)
          ? Object.assign({}, ...style.flat())
          : style,
        "data-pointer-events": pointerEvents,
        "aria-hidden": accessibilityElementsHidden,
      },
      children,
    ),
  ScrollView: (props: ScrollViewProps) => {
    scrollProps = props;
    return createElement("div", null, props.children);
  },
}));
let root: Root;
let container: HTMLDivElement;
const resize = (height: number) =>
  act(() =>
    scrollProps.onLayout?.({ nativeEvent: { layout: { height } } } as never),
  );
const content = (height: number) =>
  act(() => scrollProps.onContentSizeChange?.(300, height));
const scroll = (y: number) =>
  act(() =>
    scrollProps.onScroll?.({
      nativeEvent: {
        contentOffset: { y },
        contentSize: { height: 800 },
        layoutMeasurement: { height: 220 },
      },
    } as never),
  );
const edge = (name: string) =>
  container.querySelector<HTMLElement>(`[data-testid="scroll-fade-${name}"]`)!;
const opacity = (name: string) =>
  1 - Number(edge(name).getAttribute("data-opacity"));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.color = "light-card";
  mocks.stops = [];
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root.render(
      <ScrollFadeScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
        Activity
      </ScrollFadeScrollView>,
    ),
  );
});
afterEach(() => act(() => root.unmount()));
it("fades only hidden content and clamps native overscroll", () => {
  resize(220);
  content(800);
  expect(opacity("top")).toBe(0);
  expect(opacity("bottom")).toBe(1);
  scroll(16);
  expect(opacity("top")).toBe(0.5);
  scroll(100);
  expect(opacity("top")).toBe(1);
  expect(opacity("bottom")).toBe(1);
  scroll(580);
  expect(opacity("bottom")).toBe(0);
  scroll(620);
  expect(opacity("bottom")).toBe(0);
  scroll(-30);
  expect(opacity("top")).toBe(0);
});
it("updates fades for short content, appended activity, and resized viewports", () => {
  resize(220);
  content(80);
  expect(opacity("top")).toBe(0);
  expect(opacity("bottom")).toBe(0);
  content(800);
  expect(opacity("bottom")).toBe(1);
  resize(900);
  expect(opacity("bottom")).toBe(0);
});
it("preserves nested scrolling, callbacks, and a non-interactive accessible mask", () => {
  const onScroll = vi.fn(),
    onLayout = vi.fn(),
    onContentSizeChange = vi.fn();
  act(() =>
    root.render(
      <ScrollFadeScrollView
        nestedScrollEnabled
        style={{ maxHeight: 220 }}
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
      >
        Activity
      </ScrollFadeScrollView>,
    ),
  );
  resize(220);
  content(800);
  scroll(100);
  expect(scrollProps.nestedScrollEnabled).toBe(true);
  expect(scrollProps.style).toEqual({ maxHeight: 220 });
  expect(scrollProps.scrollEventThrottle).toBe(16);
  expect(onScroll).toHaveBeenCalledOnce();
  expect(onLayout).toHaveBeenCalledOnce();
  expect(onContentSizeChange).toHaveBeenCalledOnce();
  const mask = container.querySelector('[data-testid="scroll-fade-mask"]')!;
  expect(mask.getAttribute("data-pointer-events")).toBe("none");
  expect(mask.getAttribute("aria-hidden")).toBe("true");
  expect(
    container
      .querySelector('[data-testid="alpha-mask"]')
      ?.getAttribute("data-rendering-mode"),
  ).toBe("software");
});
it("masks content instead of painting theme colors over arbitrary backgrounds", () => {
  expect(container.querySelector('[data-testid="alpha-mask"]')).not.toBeNull();
  expect(
    container.querySelector('[data-testid="masked-content"]')?.textContent,
  ).toBe("Activity");
  expect(
    container.querySelector(
      '[data-testid="masked-content"] [data-testid="scroll-fade-top"]',
    ),
  ).toBeNull();
  expect(mocks.stops).not.toContain("light-card");
  const initial = mocks.stops.slice();
  mocks.color = "dark-card";
  mocks.stops = [];
  act(() => root.render(<ScrollFadeScrollView>Activity</ScrollFadeScrollView>));
  expect(mocks.stops).toEqual(initial);
  expect(
    container.firstElementChild?.getAttribute("style") ?? "",
  ).not.toContain("background");
});
it("keeps the center opaque and prevents overlapping fades in small viewports", () => {
  resize(40);
  content(800);
  const stops = Array.from(container.querySelectorAll("[data-offset]"));
  expect(stops.map((stop) => stop.getAttribute("data-offset"))).toEqual([
    "0%",
    "50%",
    "50%",
    "100%",
  ]);
  expect(
    stops.slice(1, 3).map((stop) => stop.getAttribute("data-opacity")),
  ).toEqual(["1", "1"]);
});
