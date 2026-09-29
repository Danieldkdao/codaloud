// @vitest-environment happy-dom
import {
  act,
  createElement,
  useImperativeHandle,
  type ReactNode,
  type Ref,
  type CSSProperties,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { KeyboardEvent, ScrollViewProps } from "react-native";
import { ProjectCodeKeyboardAccessory } from "../components/project-code-keyboard-accessory";
import { ProjectCodeSelectionMenu } from "../components/project-code-selection-menu";
import { keyboardSymbols } from "@/components/keyboard-symbols";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";

// The symbols row includes Tab and a fixed keyboard dismiss button.
const symbolButtons = keyboardSymbols.length + 2;

const state = vi.hoisted(() => ({
  listeners: new Map<string, (event: KeyboardEvent) => void>(),
  bottom: 844,
  dismissKeyboard: vi.fn(),
  scrollProps: {} as ScrollViewProps,
}));
vi.mock("react-native-reanimated", () => {
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
  };
  return {
    default: {
      View: ({ children, testID, style }: any) =>
        createElement("div", { "data-testid": testID, style }, children),
    },
    FadeIn: transition,
    FadeOut: transition,
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
  };
});
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: {
    getImageSource: async (name: string) => ({ uri: name }),
  },
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "foreground" }));
vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({
    label,
    sections,
  }: {
    label: string;
    sections: {
      options: { label: string; disabled?: boolean; onSelect: () => void }[];
    }[];
  }) =>
    createElement(
      "div",
      { "aria-label": label },
      sections.flatMap((section) =>
        section.options.map((option) =>
          createElement(
            "button",
            {
              key: option.label,
              disabled: option.disabled,
              onClick: option.onSelect,
            },
            option.label,
          ),
        ),
      ),
    ),
}));
vi.mock("react-native", () => ({
  Keyboard: {
    metrics: () => undefined,
    scheduleLayoutAnimation: vi.fn(),
    addListener: (name: string, callback: (event: KeyboardEvent) => void) => {
      state.listeners.set(name, callback);
      return { remove: () => state.listeners.delete(name) };
    },
  },
  View: ({
    children,
    ref,
    style,
    testID,
  }: {
    children?: ReactNode;
    ref?: Ref<unknown>;
    style?: CSSProperties;
    testID?: string;
  }) => {
    useImperativeHandle(ref, () => ({
      measureInWindow: (callback: (...args: number[]) => void) =>
        callback(0, 0, 390, state.bottom),
    }));
    return createElement("div", { style, "data-testid": testID }, children);
  },
  ScrollView: (props: ScrollViewProps) => {
    state.scrollProps = props;
    return createElement(
      "div",
      {
        "data-persist-taps": props.keyboardShouldPersistTaps,
        "data-testid": props.testID,
      },
      props.children,
    );
  },
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, onClick: onPress },
      children,
    ),
  useWindowDimensions: () => ({ width: 390, height: state.bottom }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0 }),
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-glass": true }, children),
}));
vi.mock("@/components/ui/text", () => ({
  CodeText: ({ children }: { children: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("@/components/ui/icon", () => ({
  Icon: ({ name }: { name: string }) =>
    createElement("span", { "data-icon": name }),
}));

let root: Root;
let container: HTMLDivElement;
const Probe = () => {
  const frame = useKeyboardFrame();
  return createElement(ProjectCodeKeyboardAccessory, {
    frame,
    onDismissKeyboard: state.dismissKeyboard,
  });
};
const show = (screenY: number) =>
  act(() =>
    state.listeners.get("keyboardDidShow")?.({
      endCoordinates: {
        screenY,
        screenX: 0,
        height: 844 - screenY,
        width: 390,
      },
      duration: 250,
      easing: "keyboard",
    } as KeyboardEvent),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.bottom = 844;
  state.listeners.clear();
  state.dismissKeyboard.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));
it("replaces every keyboard toolbar row with voice controls until closed", () => {
  const props = {
    frame: { screenY: 544, screenX: 0, height: 300, width: 390 },
    onDismissKeyboard: state.dismissKeyboard,
    status: createElement("div", { "data-status": true }, "TypeScript · Undo"),
    feedback: createElement(
      "div",
      { "data-feedback": true },
      "Transcript and waveform",
    ),
  };
  act(() =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        ...props,
        voiceActive: true,
      }),
    ),
  );
  expect(container.querySelector("[data-feedback]")).not.toBeNull();
  expect(container.querySelector("[data-status]")).toBeNull();
  expect(
    container.querySelector('[data-testid="editor-keyboard-actions"]'),
  ).toBeNull();
  expect(
    container.querySelector('[data-testid="editor-keyboard-symbols"]'),
  ).toBeNull();
  act(() =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        ...props,
        voiceActive: false,
      }),
    ),
  );
  const actions = container.querySelector(
    '[data-testid="editor-keyboard-actions"]',
  )!;
  const status = container.querySelector("[data-status]")!;
  expect(status).not.toBeNull();
  expect(
    status.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(container.querySelector("[data-feedback]")).toBeNull();
});
it("can show voice feedback above both editor rows without hiding them", () => {
  act(() =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        frame: { screenY: 544, screenX: 0, height: 300, width: 390 },
        onDismissKeyboard: state.dismissKeyboard,
        voiceActive: true,
        voiceFeedbackAboveRows: true,
        status: createElement("div", { "data-status": true }, "Tools"),
        feedback: createElement("div", { "data-feedback": true }, "Voice"),
      }),
    ),
  );
  const feedback = container.querySelector("[data-feedback]")!;
  const actions = container.querySelector(
    '[data-testid="editor-keyboard-actions"]',
  )!;
  const symbols = container.querySelector(
    '[data-testid="editor-keyboard-symbols"]',
  )!;
  expect(feedback).not.toBeNull();
  expect(container.querySelector("[data-status]")).toBeNull();
  expect(actions).not.toBeNull();
  expect(symbols).not.toBeNull();
  expect(
    feedback.compareDocumentPosition(actions) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    feedback.compareDocumentPosition(symbols) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it("shows a glass strip flush with the keyboard, follows frame changes, and hides on dismissal", () => {
  act(() => root.render(createElement(Probe)));
  expect(container.querySelector("button")).toBeNull();
  show(544);
  expect(
    (
      container.querySelector(
        '[data-testid="editor-keyboard-strip"]',
      ) as HTMLElement
    ).style.bottom,
  ).toBe("300px");
  expect(container.querySelector("[data-glass]")).not.toBeNull();
  expect(
    container.querySelector('[data-persist-taps="always"]'),
  ).not.toBeNull();
  show(480);
  expect(
    (
      container.querySelector(
        '[data-testid="editor-keyboard-strip"]',
      ) as HTMLElement
    ).style.bottom,
  ).toBe("364px");
  act(() =>
    state.listeners.get("keyboardDidHide")?.({
      duration: 250,
      easing: "keyboard",
    } as KeyboardEvent),
  );
  expect(container.querySelector("button")).toBeNull();
});
it("does not add a second keyboard offset when Android has already resized the viewport", () => {
  state.bottom = 544;
  act(() => root.render(createElement(Probe)));
  show(544);
  expect(
    (
      container.querySelector(
        '[data-testid="editor-keyboard-strip"]',
      ) as HTMLElement
    ).style.bottom,
  ).toBe("0px");
});
it("offers all symbol and line-action placeholders without emitting edits", () => {
  act(() => root.render(createElement(Probe)));
  show(544);
  for (const label of [
    "(",
    ")",
    "{",
    "}",
    "[",
    "]",
    "<",
    ">",
    ".",
    ":",
    ";",
    "'",
    '"',
    "=",
    "#",
    "_",
  ]) {
    expect(
      container.querySelector(
        `[aria-label='${label === "'" ? "Apostrophe" : label === '"' ? "Double quote" : `Insert ${label}`}']`,
      ),
    ).not.toBeNull();
  }
  for (const label of [
    "Copy current line",
    "Delete current line",
    "Toggle comment",
  ]) {
    const button = container.querySelector(
      `[aria-label="${label}"]`,
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    act(() => button.click());
  }
  // Derive the total from the rendered rows so adding a symbol does not break this.
  const actions = container.querySelector(
    '[data-testid="editor-keyboard-actions"]',
  )!;
  const symbols = container.querySelector(
    '[data-testid="editor-keyboard-symbols"]',
  )!;
  expect(symbols.querySelectorAll("button")).toHaveLength(symbolButtons);
  expect(container.querySelectorAll("button")).toHaveLength(
    actions.querySelectorAll("button").length + symbolButtons,
  );
});

it("offers native selection menu placeholders with familiar clipboard and code actions", async () => {
  await act(async () => root.render(createElement(ProjectCodeSelectionMenu)));
  const labels = [...container.querySelectorAll("button")].map(
    (button) => button.textContent,
  );
  expect(labels).toEqual([
    "Cut",
    "Copy",
    "Paste",
    "Select all",
    "Explain to me with AI",
    "Toggle comment",
  ]);
  act(() =>
    container.querySelectorAll("button").forEach((button) => button.click()),
  );
  expect(
    [...container.querySelectorAll("button")].map(
      (button) => button.textContent,
    ),
  ).toEqual(labels);
});

it("keeps line and selection actions above a full-width, scrollable symbol row", () => {
  act(() =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        frame: { screenY: 544, screenX: 0, height: 300, width: 390 },
        onDismissKeyboard: state.dismissKeyboard,
        children: createElement("button", {
          "aria-label": "Selection actions",
        }),
      }),
    ),
  );
  const actions = container.querySelector(
    '[data-testid="editor-keyboard-actions"]',
  )!;
  const symbols = container.querySelector(
    '[data-testid="editor-keyboard-symbols"]',
  )!;
  expect(actions).not.toBeNull();
  expect(symbols).not.toBeNull();
  for (const label of [
    "Copy current line",
    "Delete current line",
    "Toggle comment",
    "Selection actions",
  ]) {
    expect(actions.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    expect(symbols.querySelector(`[aria-label="${label}"]`)).toBeNull();
  }
  expect(
    actions.compareDocumentPosition(symbols) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(symbols.querySelectorAll("button")).toHaveLength(symbolButtons);
  expect(state.scrollProps.horizontal).toBe(true);
  expect(container.querySelector('[data-icon="chevron-left"]')).toBeNull();
  expect(container.querySelector('[data-icon="chevron-right"]')).toBeNull();
  expect(
    container.querySelector('[data-testid^="symbol-overflow-"]'),
  ).toBeNull();
});

it("offers a fixed keyboard-close command beside the symbols", () => {
  act(() => root.render(createElement(Probe)));
  show(544);
  const symbols = container.querySelector(
    '[data-testid="editor-keyboard-symbols"]',
  )!;
  const button = symbols.querySelector(
    '[aria-label="Hide keyboard"]',
  ) as HTMLButtonElement;
  expect(button).not.toBeNull();
  expect(symbols.querySelectorAll("button")[symbolButtons - 1]).toBe(button);
  expect(
    button.querySelector('[data-icon="keyboard-close-outline"]'),
  ).not.toBeNull();
  act(() => button.click());
  expect(state.dismissKeyboard).toHaveBeenCalledOnce();
});

it("routes keyboard symbols and line actions to the live editor", async () => {
  const onCommand = vi.fn();
  await act(async () =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        onCommand,
        onDismissKeyboard: state.dismissKeyboard,
        frame: { screenX: 0, screenY: 500, height: 344, width: 390 },
      }),
    ),
  );
  act(() =>
    (
      container.querySelector('[aria-label="Insert {"]') as HTMLButtonElement
    ).click(),
  );
  expect(onCommand).toHaveBeenLastCalledWith("insert", "{");
  act(() =>
    (
      container.querySelector(
        '[aria-label="Delete current line"]',
      ) as HTMLButtonElement
    ).click(),
  );
  expect(onCommand).toHaveBeenLastCalledWith("delete-line");
});

it("offers cursor folding above symbols without requiring a selection", async () => {
  const onCommand = vi.fn();
  await act(async () =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        onCommand,
        fold: "fold",
        onDismissKeyboard: state.dismissKeyboard,
        frame: { screenX: 0, screenY: 500, height: 344, width: 390 },
      }),
    ),
  );
  const button = container.querySelector<HTMLButtonElement>(
    '[aria-label="Fold current line"]',
  )!;
  expect(button.disabled).toBe(false);
  act(() => button.click());
  expect(onCommand).toHaveBeenCalledWith("fold");
});

it.each(["/", "\\", "|", "+", "-", "@"])(
  "inserts the extra %s symbol into the editor",
  async (symbol) => {
    const onCommand = vi.fn();
    await act(async () =>
      root.render(
        createElement(ProjectCodeKeyboardAccessory, {
          onCommand,
          onDismissKeyboard: state.dismissKeyboard,
          frame: { screenX: 0, screenY: 500, height: 344, width: 390 },
        }),
      ),
    );
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === symbol,
    )!;
    expect(button).toBeDefined();
    act(() => button.click());
    expect(onCommand).toHaveBeenCalledWith("insert", symbol);
  },
);

it("routes all four cursor controls through a scrollable action row without dismissing the keyboard", () => {
  const onCommand = vi.fn();
  act(() =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        onCommand,
        onDismissKeyboard: state.dismissKeyboard,
        frame: { screenX: 0, screenY: 500, height: 344, width: 390 },
      }),
    ),
  );
  const actions = container.querySelector(
    '[data-testid="editor-keyboard-action-scroll"]',
  )!;
  expect(actions).not.toBeNull();
  expect(actions.getAttribute("data-persist-taps")).toBe("always");
  for (const direction of ["left", "right", "up", "down"]) {
    const button = actions.querySelector(
      `[aria-label="Move cursor ${direction}"]`,
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    act(() => button.click());
    expect(onCommand).toHaveBeenLastCalledWith(`cursor-${direction}`);
  }
  expect(actions.querySelector('[aria-label="Hide keyboard"]')).toBeNull();
  expect(state.dismissKeyboard).not.toHaveBeenCalled();
});
it("keeps the voice button fixed outside the horizontally scrolling actions before recording", () => {
  act(() =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        frame: { screenY: 544, screenX: 0, height: 300, width: 390 },
        onDismissKeyboard: state.dismissKeyboard,
        voice: createElement("button", { "data-voice": true }, "Microphone"),
        feedback: createElement("div", { "data-feedback": true }, "Listening"),
      }),
    ),
  );
  expect(
    container.querySelector(
      '[data-testid="editor-keyboard-actions"] [data-voice]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelector(
      '[data-testid="editor-keyboard-action-scroll"] [data-voice]',
    ),
  ).toBeNull();
  expect(
    container.querySelector(
      '[data-testid="editor-keyboard-strip"] [data-feedback]',
    ),
  ).toBeNull();
});

it("routes the symbols row Tab button to the editor indentation command", () => {
  const onCommand = vi.fn();
  act(() =>
    root.render(
      createElement(ProjectCodeKeyboardAccessory, {
        frame: { screenY: 544, screenX: 0, height: 300, width: 390 },
        onCommand,
        onDismissKeyboard: state.dismissKeyboard,
      }),
    ),
  );
  const button = container.querySelector<HTMLButtonElement>(
    '[aria-label="Insert tab"]',
  );
  expect(button).not.toBeNull();
  act(() => button!.click());
  expect(onCommand).toHaveBeenCalledExactlyOnceWith("tab");
});

it("enables Explain only for an available selection and invokes the explanation handler", async () => {
  const explain = vi.fn();
  await act(async () =>
    root.render(
      createElement(ProjectCodeSelectionMenu, {
        onExplain: explain,
        canExplain: true,
      }),
    ),
  );
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "Explain to me with AI",
  )!;
  expect(button.disabled).toBe(false);
  act(() => button.click());
  expect(explain).toHaveBeenCalledOnce();
  await act(async () =>
    root.render(
      createElement(ProjectCodeSelectionMenu, {
        onExplain: explain,
        canExplain: false,
      }),
    ),
  );
  expect(button.disabled).toBe(true);
});
