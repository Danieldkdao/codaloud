// @vitest-environment happy-dom
import {
  act,
  createElement,
  useImperativeHandle,
  type ReactNode,
  type Ref,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorBottomBar } from "../components/editor-bottom-bar";

const layout = vi.hoisted(() => ({
  y: 100,
  height: 700,
  delayed: false,
  measurements: [] as (() => void)[],
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  View: ({ ref, children }: { ref: Ref<unknown>; children: ReactNode }) => {
    useImperativeHandle(ref, () => ({
      measureInWindow: (
        done: (x: number, y: number, width: number, height: number) => void,
      ) => {
        const report = () => done(0, layout.y, 390, layout.height);
        if (layout.delayed) layout.measurements.push(report);
        else report();
      },
    }));
    return createElement("div", null, children);
  },
}));
vi.mock("react-native-reanimated", () => {
  const animation = {
    duration: () => animation,
    reduceMotion: () => animation,
  };
  return {
    default: {
      View: ({
        children,
        style,
        entering,
        exiting,
      }: {
        children: ReactNode;
        style: object;
        entering?: unknown;
        exiting?: unknown;
      }) =>
        createElement(
          "div",
          {
            style,
            "data-bar": true,
            "data-fades": Boolean(entering || exiting),
          },
          children,
        ),
    },
    LinearTransition: animation,
    FadeIn: animation,
    FadeOut: animation,
    ReduceMotion: { System: "system" },
  };
});

let root: Root;
let container: HTMLDivElement;
const frame = { screenX: 0, screenY: 500, width: 390, height: 344 };
const render = (keyboard = true) =>
  act(() =>
    root.render(
      createElement(EditorBottomBar, {
        frame: keyboard ? frame : undefined,
        dockHeight: 72,
        onHeight: vi.fn(),
        children: "Find",
      }),
    ),
  );
const bottom = () =>
  (container.querySelector("[data-bar]") as HTMLElement).style.bottom;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  layout.y = 100;
  layout.height = 700;
  layout.delayed = false;
  layout.measurements = [];
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it("places search above an overlaid iOS keyboard and restores the workspace dock", () => {
  render();
  expect(bottom()).toBe("308px");
  render(false);
  expect(bottom()).toBe("80px");
});
it("does not count the Android resized viewport's keyboard height twice", () => {
  layout.height = 400;
  render();
  expect(bottom()).toBe("8px");
});
it("ignores a measurement that arrives after the keyboard has closed", () => {
  layout.delayed = true;
  render();
  render(false);
  act(() => layout.measurements.forEach((report) => report()));
  expect(bottom()).toBe("80px");
});

it("never fades a glass ancestor through zero opacity", () => {
  render();
  expect(
    container.querySelector("[data-bar]")?.getAttribute("data-fades"),
  ).toBe("false");
});
