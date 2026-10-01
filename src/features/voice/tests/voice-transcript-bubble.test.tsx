// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoiceTranscriptBubble } from "../components/voice-transcript-bubble";
import { InlineVoiceControls } from "../components/inline-voice-controls";
import type { VoiceConversation } from "../hooks/use-voice-conversation";
import { commandCenter } from "../command-center";
import { inlineSession } from "../inline-session";
vi.mock("@/features/agent/components/file-activity", () => ({
  FileActivity: () => {
    throw new Error(
      "Project provider is unavailable outside the project screen.",
    );
  },
}));
const mocks = vi.hoisted(() => ({
  textMode: false,
  scroll: vi.fn(),
  props: {} as Record<string, any>,
  bubbleProps: {} as Record<string, any>,
  viewportProps: {} as Record<string, any>,
  contentProps: {} as Record<string, any>,
  inputProps: {} as Record<string, any>,
  textInputProps: {} as Record<string, any>,
  segmentProps: [] as Record<string, any>[],
  send: vi.fn(async () => {}),
  update: vi.fn(async () => {}),
  pan: {} as Record<string, any>,
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  useEditorPreferences: () => ({
    preferences: { textMode: mocks.textMode },
    update: mocks.update,
  }),
}));
vi.mock("../components/voice-microphone", () => ({
  VoiceMicrophone: () =>
    createElement("button", { "aria-label": "Microphone" }),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  Text: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => createElement("span", { className }, children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  PanResponder: {
    create: (config: Record<string, any>) => {
      mocks.pan = config;
      return { panHandlers: {} };
    },
  },
  View: ({ children, ...props }: any) => {
    if (props.testID === "voice-transcript-content") mocks.contentProps = props;
    if (props.testID === "command-input-accessory") mocks.inputProps = props;
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
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.textInputProps = props;
    return null;
  },
}));
vi.mock("../text-command", () => ({ sendTextCommand: mocks.send }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("expo-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));
vi.mock("@/components/markdown-text", () => ({
  MarkdownText: ({ text, streaming }: any) =>
    createElement("article", { "data-streaming": streaming }, text),
}));
vi.mock("@/components/ui/text", () => import("@/components/ui/text/p-text"));
vi.mock("@/lib/utils", async () => {
  const { clsx } = await import("clsx");
  const { twMerge } = await import("tailwind-merge");
  return { cn: (...items: Parameters<typeof clsx>) => twMerge(clsx(...items)) };
});
vi.mock("react-native-reanimated", async () => {
  const { useRef } = await import("react");
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
        if (props.testID === "voice-transcript-segment")
          mocks.segmentProps.push(props);
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
    useSharedValue: (initial: number) => {
      const box = useRef<{ value: number } | null>(null);
      if (box.current === null) box.current = { value: initial };
      return box.current;
    },
    withSpring: (value: number, config: object) => ({ value, config }),
    withTiming: (value: number, config: object) => ({
      value,
      config,
      valueOf: () => value,
    }),
    Easing: { inOut: (easing: unknown) => easing, cubic: "cubic" },
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
const bottomEvent = {
  nativeEvent: {
    contentOffset: { y: 600 },
    contentSize: { height: 800 },
    layoutMeasurement: { height: 200 },
  },
};
beforeEach(() => {
  commandCenter.clear();
  vi.clearAllMocks();
  mocks.segmentProps = [];
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
it("renders a draft edit result without requiring a project provider", async () => {
  const snapshot = vi.spyOn(inlineSession, "getSnapshot").mockReturnValue({
    id: "draft-edit",
    projectId: "draft:one",
    context: null,
    mode: "quick-edit",
    status: "ready",
    text: "preview",
    transcript: "edit",
    files: [{ path: "note.txt", status: "changed" }],
  });
  try {
    await act(async () =>
      root.render(
        <VoiceTranscriptBubble
          conversation={conversation}
          projectId="draft:one"
        />,
      ),
    );
    await vi.waitFor(() => expect(container.textContent).toContain("note.txt"));
    expect(container.querySelector('[aria-label="Open note.txt"]')).toBeNull();
  } finally {
    snapshot.mockRestore();
  }
});
it("labels typed quick edits without offering voice instructions", () => {
  act(() => commandCenter.open("draft:one", "quick-edit"));
  expect(container.textContent).toContain("Quick edit");
  expect(container.textContent).not.toContain("Hold to talk");
});
it("keeps the voice header short and puts gesture instructions in the wider content area", () => {
  act(() =>
    root.render(
      <VoiceTranscriptBubble
        conversation={{
          ...conversation,
          state: {
            ...conversation.state,
            connection: "idle",
            listening: false,
            transcript: [],
          },
        }}
      />,
    ),
  );
  expect(container.textContent).toContain("Ready to listen");
  expect(container.textContent).not.toContain(
    "Hold to talk · Double-tap for hands-free",
  );
  expect(container.textContent).toContain("Hold the microphone to talk");
});
it("toggles typing back to voice without clearing previous results or starting capture", () => {
  const pause = vi.fn();
  act(() =>
    root.render(
      <VoiceTranscriptBubble
        conversation={{ ...conversation, pause }}
        projectId="draft:one"
      />,
    ),
  );
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Text mode"]')!
      .click(),
  );
  expect(commandCenter.getSnapshot().input).toEqual({
    projectId: "draft:one",
    mode: "quick-edit",
  });
  expect(
    container
      .querySelector('[aria-label="Text mode"]')
      ?.classList.contains("bg-primary/10"),
  ).toBe(true);
  expect(mocks.textInputProps.keyboardSymbols).not.toBe(false);
  act(() =>
    commandCenter.show({
      kind: "output",
      projectId: "draft:one",
      title: "Result",
      text: "Saved response",
    }),
  );
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Text mode"]')!
      .click(),
  );
  expect(commandCenter.getSnapshot().input).toBeNull();
  expect(container.textContent).toContain("Saved response");
  expect(container.querySelector('[aria-label="Microphone"]')).toBeNull();
  expect(mocks.update.mock.calls).toEqual([
    [{ textMode: true }],
    [{ textMode: false }],
  ]);
  expect(conversation.stop).not.toHaveBeenCalled();
});
it("keeps the quick-edit text input out of the bottom voice controls", () => {
  act(() => commandCenter.open("draft:one", "quick-edit"));
  mocks.textInputProps = {};
  act(() => root.render(<InlineVoiceControls conversation={conversation} />));
  expect(mocks.textInputProps.accessibilityLabel).toBeUndefined();
});
it("keeps inline feedback minimal and lets recording stop without closing the controls", () => {
  const pause = vi.fn();
  const startInline = vi.fn();
  const value = {
    ...conversation,
    pause,
    startInline,
    state: {
      ...conversation.state,
      transcript: [
        ...conversation.state.transcript,
        {
          id: "assistant",
          role: "assistant" as const,
          text: "Long assistant reply",
          final: true,
        },
      ],
    },
  };
  act(() => root.render(<InlineVoiceControls conversation={value} />));
  expect(container.textContent).toContain("Hello");
  expect(container.textContent).not.toContain("Long assistant reply");
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Stop recording and send edit"]',
      )!
      .click(),
  );
  expect(pause).toHaveBeenCalledOnce();
  expect(value.stop).not.toHaveBeenCalled();
  act(() =>
    root.render(
      <InlineVoiceControls
        conversation={{ ...value, state: { ...value.state, listening: false } }}
      />,
    ),
  );
  expect(container.textContent).toContain("Hello");
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Speak another edit"]')!
      .click(),
  );
  expect(startInline).toHaveBeenCalledOnce();
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Close inline voice edit"]',
      )!
      .click(),
  );
  expect(value.stop).toHaveBeenCalledOnce();
});
it("renders both speakers as Markdown and marks unfinished replies as streaming", () => {
  act(() =>
    root.render(
      <VoiceTranscriptBubble
        conversation={{
          ...conversation,
          state: {
            ...conversation.state,
            transcript: [
              { id: "user", role: "user", text: "**Hello**", final: true },
              {
                id: "agent",
                role: "assistant",
                text: "**Welcome",
                final: false,
              },
            ],
          },
        }}
      />,
    ),
  );
  const messages = container.querySelectorAll("article");
  expect(messages).toHaveLength(2);
  expect(messages[0].textContent).toBe("**Hello**");
  expect(messages[0].getAttribute("data-streaming")).toBe("false");
  expect(messages[1].getAttribute("data-streaming")).toBe("true");
});
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
it("shows missing transcript text as a nonfatal warning while voice stays connected", () => {
  const message =
    "Some transcript text may be missing. Voice is still connected.";
  act(() =>
    root.render(
      <VoiceTranscriptBubble
        conversation={{
          ...conversation,
          state: {
            ...conversation.state,
            connection: "connected",
            transcriptWarning: message,
          },
        }}
      />,
    ),
  );
  expect(container.textContent).toContain(message);
  expect(container.textContent).not.toContain("Voice unavailable");
  expect(container.textContent).toContain("Hello");
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
  expect(container.querySelector('[aria-label="Retry voice"]')).toBeNull();
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

// The viewport height is one animated value that growth, drag and collapse all
// write to, so a test reads that single style entry to assert the size.
const viewportHeight = () => {
  const style = [mocks.viewportProps.style]
    .flat()
    .filter(Boolean)
    .find((entry) => entry.height !== undefined);
  return style.height;
};

it("leaves the microphone in the dock instead of adding a second press target", () => {
  expect(container.querySelector('[aria-label="Microphone"]')).toBeNull();
  conversation.pressed = true;
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
  expect(container.querySelector('[aria-label="Microphone"]')).toBeNull();
});

it("keeps the text input visible after changing modes without another layout event", () => {
  act(() => mocks.props.onContentSizeChange(300, 180));
  conversation.state = {
    ...conversation.state,
    connection: "connecting",
    listening: false,
  };
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Text mode"]')!
      .click(),
  );
  conversation.state = { ...conversation.state, connection: "idle" };
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
  expect(commandCenter.getSnapshot().input).not.toBeNull();
  const restored = viewportHeight();
  expect(
    typeof restored === "number" ? restored : restored.value,
  ).toBeGreaterThanOrEqual(120);
});

it("restores the transcript viewport after reconnecting without another content-size event", () => {
  act(() => mocks.props.onContentSizeChange(300, 180));
  conversation.state = {
    ...conversation.state,
    connection: "connecting",
    listening: false,
  };
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
  conversation.state = {
    ...conversation.state,
    connection: "connected",
    listening: true,
  };
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
  const restored = viewportHeight();
  expect(
    typeof restored === "number" ? restored : restored.value,
  ).toBeGreaterThanOrEqual(120);
});

it("grows the viewport with the reply, capped so a long reply scrolls", () => {
  const rerender = () =>
    act(() =>
      root.render(<VoiceTranscriptBubble conversation={conversation} />),
    );
  act(() => mocks.props.onContentSizeChange(0, 800));
  rerender();
  expect(viewportHeight().value).toBeCloseTo(Math.min(420, 844 * 0.45));
  expect(mocks.props.style).toMatchObject({ flex: 1 });
  act(() => mocks.props.onContentSizeChange(0, 40));
  rerender();
  expect(viewportHeight().value).toBe(120);
});

it("reserves room for the input as well as results so they cannot overlap", () => {
  act(() => commandCenter.open("p"));
  act(() =>
    mocks.inputProps.onLayout({ nativeEvent: { layout: { height: 100 } } }),
  );
  act(() => mocks.props.onContentSizeChange(0, 140));
  act(() => root.render(<VoiceTranscriptBubble conversation={conversation} />));
  expect(viewportHeight().value).toBeGreaterThanOrEqual(240);
});

it("lets native transcript rows keep their height while the input and keyboard constrain the scroll area", () => {
  act(() => commandCenter.open("p"));
  act(() =>
    root.render(
      <VoiceTranscriptBubble conversation={conversation} maxHeight={180} />,
    ),
  );
  expect(mocks.props.style).toMatchObject({ flex: 1, minHeight: 0 });
  expect(mocks.segmentProps.length).toBeGreaterThan(0);
  for (const segment of mocks.segmentProps) {
    expect(segment.style).toMatchObject({ flexShrink: 0 });
    expect(segment.layout).toBeUndefined();
  }
});

it("submits the native keyboard's final text even when the last character has not rerendered", async () => {
  act(() => commandCenter.open("p"));
  act(() => mocks.textInputProps.onChangeText("Open termina"));
  await act(async () =>
    mocks.textInputProps.onSubmitEditing({
      nativeEvent: { text: "Open terminal" },
    }),
  );
  expect(mocks.send).toHaveBeenCalledWith("p", "Open terminal", "agent");
});

it("drags between the floor and the cap and never below the floor", () => {
  const rerender = () =>
    act(() =>
      root.render(<VoiceTranscriptBubble conversation={conversation} />),
    );
  act(() => {
    mocks.pan.onPanResponderGrant();
    mocks.pan.onPanResponderMove({}, { dy: -200 });
  });
  rerender();
  expect(viewportHeight()).toBe(320);
  act(() => mocks.pan.onPanResponderMove({}, { dy: 600 }));
  rerender();
  expect(viewportHeight()).toBe(120);
  act(() => mocks.pan.onPanResponderMove({}, { dy: -4000 }));
  rerender();
  expect(viewportHeight()).toBeCloseTo(Math.min(420, 844 * 0.45));
});

it("collapses to nothing and slides back open from the same chevron", () => {
  act(() => mocks.props.onContentSizeChange(0, 800));
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Collapse transcript"]')!
      .click(),
  );
  expect(viewportHeight().value).toBe(0);
  expect(mocks.viewportProps.pointerEvents).toBe("none");
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Expand transcript"]')!
      .click(),
  );
  expect(viewportHeight().value).toBeCloseTo(Math.min(420, 844 * 0.45));
  expect(mocks.viewportProps.pointerEvents).toBe("auto");
});

it("collapses to nothing from the chevron with a slide, not a jump", () => {
  act(() => mocks.props.onContentSizeChange(0, 800));
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Collapse transcript"]')!
      .click(),
  );
  expect(viewportHeight().value).toBe(0);
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

// A touch that never becomes a scroll must not cost the transcript its tail.
it("keeps following the latest text when a touch never turns into a scroll", () => {
  act(() => mocks.props.onScrollBeginDrag());
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain("Jump to latest");
});

it("does not mistake intermediate automatic scroll events for a user scrolling away", () => {
  act(() => mocks.props.onContentSizeChange());
  act(() => mocks.props.onMomentumScrollBegin());
  act(() => mocks.props.onScroll(scrollEvent));
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain("Jump to latest");
});

it("resumes following when the user scrolls back to the bottom without the button", () => {
  act(() => {
    mocks.props.onScrollBeginDrag();
    mocks.props.onScroll(scrollEvent);
  });
  expect(container.textContent).toContain("Jump to latest");
  act(() => mocks.props.onScroll(bottomEvent));
  expect(container.textContent).not.toContain("Jump to latest");
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledOnce();
});

// A flick ends the gesture long after the last offset arrives, so the handlers
// that clear the gesture flags must not also freeze the follow decision.
it("keeps following after a drag and flick gesture ends", () => {
  act(() => {
    mocks.props.onScrollBeginDrag();
    mocks.props.onScroll(scrollEvent);
  });
  act(() => {
    mocks.props.onScrollEndDrag();
    mocks.props.onMomentumScrollBegin();
    mocks.props.onScroll(scrollEvent);
  });
  act(() => {
    mocks.props.onMomentumScrollEnd();
    mocks.props.onScroll(bottomEvent);
  });
  act(() => mocks.props.onContentSizeChange());
  expect(mocks.scroll).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain("Jump to latest");
});
