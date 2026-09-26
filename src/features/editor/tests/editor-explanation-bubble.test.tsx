// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EditorExplanationBubble } from "../components/editor-explanation-bubble";
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: any) => createElement("section", null, children),
}));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: any) => createElement("h2", null, children),
  PText: ({ children }: any) => createElement("span", null, children),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/markdown-text", () => ({
  MarkdownText: ({ text, streaming }: any) =>
    createElement("article", { "data-streaming": streaming }, text),
}));
vi.mock("react-native", () => ({
  View: ({ children }: any) => createElement("div", null, children),
  ScrollView: ({ children, style }: any) =>
    createElement("div", { style, "data-scroll": true }, children),
  Pressable: ({ children, onPress, accessibilityLabel }: any) =>
    createElement(
      "button",
      { onClick: onPress, "aria-label": accessibilityLabel },
      children,
    ),
  ActivityIndicator: () => createElement("span", null, "Loading"),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: any) => createElement("div", null, children),
  },
  useSharedValue: () => ({ value: 1 }),
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => true,
  cancelAnimation: () => {},
  withRepeat: () => 1,
  withTiming: () => 1,
}));
it("keeps close available while loading and streams Markdown into a bounded scroller", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const close = vi.fn();
  try {
    await act(async () =>
      root.render(
        createElement(EditorExplanationBubble, {
          state: { status: "loading", text: "", highlight: null },
          maxHeight: 240,
          onClose: close,
        }),
      ),
    );
    expect(container.textContent).toContain("Explaining");
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close explanation"]')!
        .click(),
    );
    expect(close).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        createElement(EditorExplanationBubble, {
          state: { status: "streaming", text: "**Code**", highlight: null },
          maxHeight: 240,
          onClose: close,
        }),
      ),
    );
    expect(container.querySelector("article")?.textContent).toBe("**Code**");
    expect(
      container.querySelector("article")?.getAttribute("data-streaming"),
    ).toBe("true");
    expect(
      parseFloat(
        container.querySelector<HTMLElement>("[data-scroll]")!.style.maxHeight,
      ),
    ).toBeLessThan(240);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
