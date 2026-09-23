// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FlatListProps } from "react-native";
import { ScrollFadeFlatList } from "@/components/ui/scroll-fade-flat-list";

let listProps: FlatListProps<string>;
vi.mock("@react-native-masked-view/masked-view", () => ({
  default: ({ children, maskElement }: any) =>
    createElement("div", null, maskElement, children),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "var(--card)" }));
vi.mock("react-native-svg", () => {
  const Node = ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children);
  return {
    default: Node,
    Defs: Node,
    LinearGradient: Node,
    Rect: Node,
    Stop: ({ offset, stopOpacity }: any) =>
      createElement("span", {
        "data-testid":
          offset === "0%"
            ? "scroll-fade-top"
            : offset === "100%"
              ? "scroll-fade-bottom"
              : undefined,
        "data-opacity": stopOpacity,
      }),
  };
});
vi.mock("react-native", () => ({
  View: ({
    children,
    testID,
    style,
  }: {
    children?: ReactNode;
    testID?: string;
    style?: object;
  }) => createElement("div", { "data-testid": testID, style }, children),
  FlatList: (props: FlatListProps<string>) => {
    listProps = props;
    return null;
  },
}));
let root: Root;
let container: HTMLDivElement;
const resize = (height: number) =>
  act(() =>
    listProps.onLayout?.({ nativeEvent: { layout: { height } } } as never),
  );
const content = (height: number) =>
  act(() => listProps.onContentSizeChange?.(300, height));
const scroll = (y: number) =>
  act(() =>
    listProps.onScroll?.({
      nativeEvent: {
        contentOffset: { y },
        contentSize: { height: 1000 },
        layoutMeasurement: { height: 300 },
      },
    } as never),
  );
const opacity = (edge: string) =>
  1 -
  Number(
    container
      .querySelector<HTMLElement>(`[data-testid="scroll-fade-${edge}"]`)!
      .getAttribute("data-opacity"),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root.render(
      createElement(ScrollFadeFlatList<string>, {
        data: ["branch"],
        renderItem: () => null,
      }),
    ),
  );
});
afterEach(() => act(() => root.unmount()));
it("only fades edges with hidden content, including both scroll boundaries", () => {
  resize(300);
  content(1000);
  expect(opacity("top")).toBe(0);
  expect(opacity("bottom")).toBe(1);
  scroll(200);
  expect(opacity("top")).toBe(1);
  expect(opacity("bottom")).toBe(1);
  scroll(700);
  expect(opacity("top")).toBe(1);
  expect(opacity("bottom")).toBe(0);
  scroll(0);
  expect(opacity("top")).toBe(0);
  expect(opacity("bottom")).toBe(1);
});
it("hides fades for short lists and updates after resizing or changing content", () => {
  resize(300);
  content(200);
  expect(opacity("top")).toBe(0);
  expect(opacity("bottom")).toBe(0);
  content(1000);
  expect(opacity("bottom")).toBe(1);
  resize(1200);
  expect(opacity("bottom")).toBe(0);
});
it("eases fades near the edges and clamps overscroll", () => {
  resize(300);
  content(1000);
  scroll(16);
  expect(opacity("top")).toBe(0.5);
  scroll(-40);
  expect(opacity("top")).toBe(0);
  scroll(740);
  expect(opacity("bottom")).toBe(0);
});
