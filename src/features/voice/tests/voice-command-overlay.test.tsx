// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  frame: undefined as { screenY: number } | undefined,
  symbolInset: 0,
  pending: [] as (() => void)[],
  delayed: false,
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => mocks.frame,
}));
vi.mock("@/hooks/use-keyboard-symbols", () => ({
  useKeyboardSymbolsAccessoryHeight: () => mocks.symbolInset,
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  View: ({ ref, children, style, testID, top }: any) => {
    useImperativeHandle(
      ref,
      () => ({
        measureInWindow: (
          done: (x: number, y: number, width: number, height: number) => void,
        ) => {
          const report = () =>
            done(0, top ?? 100, 390, top === undefined ? 700 : 48);
          if (mocks.delayed && top !== undefined) mocks.pending.push(report);
          else report();
        },
      }),
      [top],
    );
    return createElement("div", { style, "data-testid": testID }, children);
  },
}));
vi.mock("react-native-reanimated", () => {
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
  };
  return {
    default: {
      View: ({ children, style, testID }: any) =>
        createElement("div", { style, "data-testid": testID }, children),
    },
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
  };
});
import { View } from "react-native";
import { VoiceCommandOverlay } from "../components/voice-command-overlay";
import { useCommandBubbleAnchor } from "../hooks/use-command-bubble-layout";

const Anchor = ({
  scope,
  top,
  enabled = true,
}: {
  scope: string;
  top: number;
  enabled?: boolean;
}) => {
  const anchor = useCommandBubbleAnchor(scope, enabled);
  return createElement(View, { ...anchor, ...{ top } });
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.frame = undefined;
  mocks.symbolInset = 0;
  mocks.delayed = false;
  mocks.pending = [];
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));
const render = (children: ReactNode, scope = "/projects/one/code") =>
  act(() =>
    root.render(
      <>
        {children}
        <VoiceCommandOverlay scope={scope}>
          {(maxHeight) => <span data-max-height={maxHeight}>Bubble</span>}
        </VoiceCommandOverlay>
      </>,
    ),
  );
const bottom = () =>
  container.querySelector<HTMLElement>('[data-testid="voice-command-overlay"]')!
    .style.bottom;

it("floats above the entire bottom stack using screen coordinates inside a nested viewport", () => {
  render(
    <>
      <Anchor scope="/projects/one/code" top={760} />
      <Anchor scope="/projects/one/code" top={720} />
    </>,
  );
  expect(bottom()).toBe("88px");
  expect(
    container.querySelector<HTMLElement>(
      '[data-testid="voice-command-overlay"]',
    )!.style.top,
  ).toBe("");
});
it("follows resized keyboards, symbols and editor accessories without applying keyboard height twice", () => {
  mocks.frame = { screenY: 500 };
  mocks.symbolInset = 48;
  render(<Anchor scope="/projects/one/code" top={720} />);
  expect(bottom()).toBe("356px");
  render(<Anchor scope="/projects/one/code" top={400} />);
  expect(bottom()).toBe("408px");
  mocks.frame = undefined;
  mocks.symbolInset = 0;
  render(<Anchor scope="/projects/one/code" top={720} />);
  expect(bottom()).toBe("88px");
});
it("ignores the covered editor's anchors and follows the current route including nested previews", () => {
  const controls = (
    <>
      <Anchor scope="/projects/one/code" top={500} />
      <Anchor scope="/projects/one/files" top={740} />
    </>
  );
  render(controls, "/projects/one/files/preview");
  expect(bottom()).toBe("68px");
  render(controls);
  expect(bottom()).toBe("308px");
});
it("removes hidden and unmounted anchors rather than retaining an old keyboard position", () => {
  render(
    <>
      <Anchor scope="draft:one" top={760} />
      <Anchor scope="draft:one" top={450} />
    </>,
    "draft:one",
  );
  expect(bottom()).toBe("358px");
  render(
    <>
      <Anchor scope="draft:one" top={760} />
      <Anchor scope="draft:one" top={450} enabled={false} />
    </>,
    "draft:one",
  );
  expect(bottom()).toBe("48px");
  render(<Anchor scope="draft:one" top={760} />, "draft:one");
  expect(bottom()).toBe("48px");
});
it("rejects late measurements from a previous resource", () => {
  mocks.delayed = true;
  render(<Anchor scope="draft:one" top={400} />, "draft:one");
  const previous = mocks.pending.splice(0);
  render(<Anchor scope="draft:two" top={720} />, "draft:two");
  act(() => mocks.pending.splice(0).forEach((report) => report()));
  expect(bottom()).toBe("88px");
  act(() => previous.forEach((report) => report()));
  expect(bottom()).toBe("88px");
});
