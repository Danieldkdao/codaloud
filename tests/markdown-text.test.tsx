// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  props: {} as any,
  open: vi.fn(),
  dark: false,
}));
vi.mock("react-native", () => ({
  Linking: { openURL: mocks.open },
  Alert: { alert: vi.fn() },
}));
vi.mock("@/hooks/use-theme", () => ({
  useThemeColor: (name: string) => `${mocks.dark ? "dark" : "light"}-${name}`,
}));
vi.mock("react-native-enriched-markdown", () => ({
  EnrichedMarkdownText: (props: any) => {
    mocks.props = props;
    return createElement("span", null, props.markdown);
  },
}));
import { MarkdownText } from "@/components/markdown-text";

it("preserves intrinsic text height inside a constrained transcript viewport", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  try {
    act(() => root.render(<MarkdownText text={"Long reply\n\n".repeat(30)} />));
    expect(mocks.props.containerStyle.flexShrink).toBe(0);
  } finally {
    act(() => root.unmount());
  }
});

it("repairs streaming emphasis, preserves finished source, and follows theme colors", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  try {
    act(() =>
      root.render(<MarkdownText text="A **streaming reply" streaming />),
    );
    expect(mocks.props.markdown).toBe("A **streaming reply**");
    expect(mocks.props.flavor).toBe("github");
    expect(mocks.props.selectable).toBe(true);
    expect(mocks.props.markdownStyle.paragraph.color).toBe("light-foreground");
    mocks.dark = true;
    act(() => root.render(<MarkdownText text="A **streaming reply" />));
    expect(mocks.props.markdown).toBe("A **streaming reply");
    expect(mocks.props.markdownStyle.codeBlock.backgroundColor).toBe(
      "dark-card",
    );
    await mocks.props.onLinkPress({ url: "javascript:alert(1)" });
    await mocks.props.onLinkPress({ url: "file:///private/document" });
    expect(mocks.open).not.toHaveBeenCalled();
    mocks.open.mockResolvedValue(undefined);
    await mocks.props.onLinkPress({ url: "https://example.com/docs" });
    expect(mocks.open).toHaveBeenCalledWith("https://example.com/docs");
  } finally {
    act(() => root.unmount());
    mocks.dark = false;
  }
});
