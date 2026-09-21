// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoiceTranscriptBubble } from "../components/voice-transcript-bubble";
import type { VoiceConversation } from "../hooks/use-voice-conversation";
const mocks = vi.hoisted(() => ({
  scroll: vi.fn(),
  props: {} as Record<string, any>,
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  Pressable: ({
    children,
    onPress,
  }: {
    children?: ReactNode;
    onPress: () => void;
  }) => createElement("button", { onClick: onPress }, children),
  ScrollView: ({ ref, children, ...props }: any) => {
    mocks.props = props;
    useImperativeHandle(ref, () => ({ scrollToEnd: mocks.scroll }));
    return createElement("div", null, children);
  },
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("@/lib/utils", () => ({
  cn: (...items: unknown[]) => items.filter(Boolean).join(" "),
}));
vi.mock("react-native-reanimated", () => {
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
  };
  return {
    default: {
      View: ({ children }: { children?: ReactNode }) =>
        createElement("div", null, children),
    },
    FadeIn: transition,
    FadeInDown: transition,
    FadeOutDown: transition,
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
  };
});
let root: Root;
let container: HTMLDivElement;
let conversation: VoiceConversation;
const scrollEvent = {
  nativeEvent: {
    contentOffset: { y: 0 },
    contentSize: { height: 800 },
    layoutMeasurement: { height: 200 },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  root = createRoot(container);
  conversation = {
    visible: true,
    state: {
      connection: "connected",
      mode: "hands-free",
      listening: true,
      agentState: "listening",
      transcript: [{ id: "one", role: "user", text: "Hello", final: true }],
      error: null,
    },
    stop: vi.fn(),
  } as unknown as VoiceConversation;
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
});
afterEach(() => act(() => root.unmount()));
it("follows streaming text until the user scrolls back, then offers jump to latest", () => {
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledOnce();
  act(() => {
    mocks.props.onScrollBeginDrag();
    mocks.props.onScroll(scrollEvent);
  });
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledOnce();
  const latest = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Jump to latest",
  )!;
  act(() => latest.click());
  expect(mocks.scroll).toHaveBeenCalledTimes(2);
});
it("programmatic scrolling keeps following and a new conversation resets scroll history", () => {
  act(() => mocks.props.onScroll(scrollEvent));
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledOnce();
  act(() => {
    mocks.props.onScrollBeginDrag();
    mocks.props.onScroll(scrollEvent);
  });
  act(() =>
    root.render(
      <VoiceTranscriptBubble
        conversation={{ ...conversation, visible: false }}
      />,
    ),
  );
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledTimes(2);
});
