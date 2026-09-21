// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoiceTranscriptBubble } from "../components/voice-transcript-bubble";
import type { VoiceConversation } from "../hooks/use-voice-conversation";
const mocks = vi.hoisted(() => ({
  scroll: vi.fn(),
  props: {} as Record<string, any>,
  bubbleProps: {} as Record<string, any>,
}));
vi.mock("react-native", () => ({
  Text: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => createElement("span", { className }, children),
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
  GlassSurface: ({ children }: { children?: ReactNode }) =>
    createElement("section", { "data-glass-surface": true }, children),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => import("@/components/ui/text/p-text"));
vi.mock("@/lib/utils", async () => {
  const { clsx } = await import("clsx");
  const { twMerge } = await import("tailwind-merge");
  return { cn: (...items: Parameters<typeof clsx>) => twMerge(clsx(...items)) };
});
vi.mock("react-native-reanimated", () => {
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
    springify: () => transition,
    damping: () => transition,
    stiffness: () => transition,
    build: () => () => ({
      initialValues: { opacity: 0 },
      animations: { opacity: 1 },
    }),
  };
  return {
    default: {
      View: ({ children, ...props }: any) => {
        if (props.style?.alignSelf === "center") mocks.bubbleProps = props;
        return createElement("div", null, children);
      },
    },
    withSpring: (value: number, config: object) => ({ value, config }),
    withTiming: (value: number, config: object) => ({ value, config }),
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
it("keeps the Outfit family on voice status, errors, and speaker labels", () => {
  const failed = {
    ...conversation,
    state: {
      ...conversation.state,
      connection: "error" as const,
      error: "Voice could not connect.",
    },
  };
  act(() => root.render(<VoiceTranscriptBubble conversation={failed} />));
  for (const label of [
    "Voice unavailable",
    "Voice could not connect.",
    "You",
  ]) {
    const text = Array.from(container.querySelectorAll("span")).find(
      (node) => node.textContent === label,
    )!;
    expect(text.classList.contains("font-sans"), label).toBe(true);
  }
});
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

it.each(["connecting", "error", "connected"] as const)(
  "keeps %s content in glass without fading its ancestor to zero opacity",
  (connection) => {
    const next = {
      ...conversation,
      state: {
        ...conversation.state,
        connection,
        error:
          connection === "error" ? "Install the app to enable voice." : null,
        transcript:
          connection === "connected" ? conversation.state.transcript : [],
      },
    };
    act(() => root.render(<VoiceTranscriptBubble conversation={next} />));
    const surface = container.querySelector("[data-glass-surface]")!;
    expect(surface.textContent).toContain(
      connection === "error"
        ? "Install the app"
        : connection === "connected"
          ? "Hello"
          : "Getting ready",
    );
    for (const transition of [
      mocks.bubbleProps.entering,
      mocks.bubbleProps.exiting,
    ]) {
      const animation =
        typeof transition === "function" ? transition : transition.build();
      const { initialValues, animations } = animation({
        targetHeight: 200,
        currentHeight: 200,
      });
      expect(initialValues.opacity ?? 1).toBe(1);
      expect(animations.opacity ?? 1).toBe(1);
      expect(animations.transform.length).toBeGreaterThan(0);
      for (const transform of animations.transform) {
        const animated = Object.values(transform)[0] as {
          config: { reduceMotion: string };
        };
        expect(animated.config.reduceMotion).toBe("system");
      }
    }
  },
);
