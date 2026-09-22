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
  viewportProps: {} as Record<string, any>,
  contentProps: {} as Record<string, any>,
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
  View: ({ children, ...props }: any) => {
    if (props.testID === "voice-transcript-content") mocks.contentProps = props;
    return createElement("div", null, children);
  },
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    accessibilityState,
    className,
  }: any) =>
    createElement(
      "button",
      {
        onClick: onPress,
        "aria-label": accessibilityLabel,
        "aria-expanded": accessibilityState?.expanded,
        className,
      },
      children,
    ),
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
        if (props.testID === "voice-transcript-viewport")
          mocks.viewportProps = props;
        return createElement(
          "div",
          {
            "data-testid": props.testID,
            hidden: props.accessibilityElementsHidden,
          },
          children,
        );
      },
    },
    useAnimatedStyle: (factory: () => unknown) => factory(),
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

it("shows a destructive failure after the transcript without a retry button", () => {
  const message = "Failed to generate response. Please try again.";
  act(() =>
    root.render(
      <VoiceTranscriptBubble
        conversation={{
          ...conversation,
          state: { ...conversation.state, connection: "error", error: message },
        }}
      />,
    ),
  );
  const text = Array.from(container.querySelectorAll("span"));
  const error = text.find((node) => node.textContent === message)!;
  expect(error.classList.contains("text-destructive")).toBe(true);
  expect(text.indexOf(error)).toBeGreaterThan(
    text.findIndex((node) => node.textContent === "Hello"),
  );
  expect(container.querySelectorAll("button")).toHaveLength(2);
});

it("collapses without stopping voice and reopens with text received while hidden", () => {
  const toggle = container.querySelector<HTMLButtonElement>(
    '[aria-label="Collapse transcript"]',
  )!;
  expect(toggle).not.toBeNull();
  expect(toggle.className).toContain("size-12");
  act(() => toggle.click());
  expect(
    container.querySelector<HTMLDivElement>(
      '[data-testid="voice-transcript-viewport"]',
    )?.hidden,
  ).toBe(true);
  expect(container.querySelector('[aria-expanded="false"]')).not.toBeNull();
  expect(conversation.stop).not.toHaveBeenCalled();
  const next = {
    ...conversation,
    state: {
      ...conversation.state,
      transcript: [
        ...conversation.state.transcript,
        {
          id: "reply",
          role: "assistant" as const,
          text: "New reply",
          final: true,
        },
      ],
    },
  };
  act(() => root.render(<VoiceTranscriptBubble conversation={next} />));
  expect(
    container.querySelector<HTMLDivElement>(
      '[data-testid="voice-transcript-viewport"]',
    )?.hidden,
  ).toBe(true);
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Expand transcript"]')!
      .click(),
  );
  expect(container.textContent).toContain("Hello");
  expect(container.textContent).toContain("New reply");
  expect(conversation.stop).not.toHaveBeenCalled();
});

it("animates measured transcript height through collapse, resize, and rapid reopening", () => {
  expect(mocks.contentProps.onLayout).toBeTypeOf("function");
  act(() =>
    mocks.contentProps.onLayout({ nativeEvent: { layout: { height: 180 } } }),
  );
  const animatedHeight = () =>
    mocks.viewportProps.style
      .flat()
      .find((style: any) => style?.height !== undefined).height;
  expect(animatedHeight()).toMatchObject({
    value: 180,
    config: { reduceMotion: "system" },
  });
  const content = container.querySelector(
    '[data-testid="voice-transcript-viewport"]',
  )!.firstChild;
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Collapse transcript"]')!
      .click(),
  );
  expect(animatedHeight()).toMatchObject({ value: 0 });
  expect(mocks.viewportProps.pointerEvents).toBe("none");
  expect(mocks.viewportProps.importantForAccessibility).toBe(
    "no-hide-descendants",
  );
  act(() =>
    mocks.contentProps.onLayout({ nativeEvent: { layout: { height: 220 } } }),
  );
  expect(animatedHeight()).toMatchObject({ value: 0 });
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Expand transcript"]')!
      .click(),
  );
  expect(animatedHeight()).toMatchObject({ value: 220 });
  expect(
    container.querySelector('[data-testid="voice-transcript-viewport"]')!
      .firstChild,
  ).toBe(content);
  expect(mocks.viewportProps.pointerEvents).toBe("auto");
  expect(conversation.stop).not.toHaveBeenCalled();
});

it("keeps close available when collapsed and expands a new conversation", () => {
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Collapse transcript"]')!
      .click(),
  );
  const close = container.querySelector<HTMLButtonElement>(
    '[aria-label="Close voice conversation"]',
  )!;
  expect(close.className).toContain("size-12");
  act(() => close.click());
  expect(conversation.stop).toHaveBeenCalledOnce();
  act(() =>
    root.render(
      <VoiceTranscriptBubble
        conversation={{ ...conversation, visible: false }}
      />,
    ),
  );
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
  expect(container.textContent).toContain("Hello");
  expect(container.querySelector('[aria-expanded="true"]')).not.toBeNull();
});

it("groups consecutive speakers while replacing streamed partial text", () => {
  const transcript = [
    { id: "one", role: "user" as const, text: "Hello.", final: true },
    { id: "two", role: "user" as const, text: "How", final: false },
    { id: "three", role: "assistant" as const, text: "Good.", final: true },
    { id: "four", role: "assistant" as const, text: "Thank you.", final: true },
    { id: "five", role: "user" as const, text: "Great.", final: true },
  ];
  const render = () =>
    act(() =>
      root.render(
        <VoiceTranscriptBubble
          conversation={{
            ...conversation,
            state: { ...conversation.state, transcript },
          }}
        />,
      ),
    );
  render();
  expect(container.textContent).toContain("Hello. How");
  expect(container.textContent).not.toContain("▍");
  expect(container.textContent).toContain("Good. Thank you.");
  transcript[1] = { ...transcript[1]!, text: "How are you?", final: true };
  render();
  expect(container.textContent).toContain("Hello. How are you?");
  expect(container.textContent).not.toContain("Hello. How How");
  const labels = Array.from(container.querySelectorAll("span"))
    .map((node) => node.textContent)
    .filter((text) => text === "You" || text === "Codaloud");
  expect(labels).toEqual(["You", "Codaloud", "You"]);
});

it("keeps jump-to-latest hidden through programmatic momentum until a new drag", () => {
  act(() => {
    mocks.props.onScrollBeginDrag();
    mocks.props.onScroll(scrollEvent);
  });
  const latest = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Jump to latest",
  )!;
  act(() => latest.click());
  act(() => {
    mocks.props.onMomentumScrollBegin();
    mocks.props.onScroll(scrollEvent);
  });
  expect(container.textContent).not.toContain("Jump to latest");
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledTimes(2);
  act(() => {
    mocks.props.onMomentumScrollEnd();
    mocks.props.onScrollBeginDrag();
    mocks.props.onScroll(scrollEvent);
  });
  expect(container.textContent).toContain("Jump to latest");
});
