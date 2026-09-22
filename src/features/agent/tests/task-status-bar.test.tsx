// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TaskStatusBar } from "../components/task-status-bar";

const mocks = vi.hoisted(() => ({ surface: {} as any }));
vi.mock("@/lib/utils", async () => {
  const { clsx } = await import("clsx");
  const { twMerge } = await import("tailwind-merge");
  return { cn: (...items: Parameters<typeof clsx>) => twMerge(clsx(...items)) };
});
vi.mock("../hooks/use-agent-tasks", () => ({
  useAgentTasks: () => [
    {
      request: {
        projectId: "project",
        requestId: "request",
        instruction: "Read files",
        title: "Explore project",
      },
      event: {
        status: "running",
        logs: ["Running: Read file", "Completed Read file"],
        summary: "**Files reviewed**",
      },
    },
  ],
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "inherit" }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/markdown-text", () => ({
  MarkdownText: ({ text }: any) => createElement("article", null, text),
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: any) => createElement("span", null, children),
  HeadingText: ({ children }: any) => createElement("span", null, children),
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: any) =>
    createElement("section", { "data-glass": true }, children),
}));
vi.mock("@/components/ui/content-sheet", () => ({
  ContentSheet: ({ open, children }: any) =>
    open ? createElement("aside", null, children) : null,
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  ActivityIndicator: () => null,
  View: ({ children }: any) => createElement("div", null, children),
  ScrollView: ({ children, testID, style }: any) =>
    createElement("div", { "data-testid": testID, style }, children),
  Pressable: ({ children, onPress, accessibilityLabel }: any) =>
    createElement(
      "button",
      { onClick: onPress, "aria-label": accessibilityLabel },
      children,
    ),
}));
vi.mock("react-native-reanimated", () => {
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
    build: () => () => ({
      initialValues: { opacity: 0 },
      animations: { opacity: 0 },
    }),
  };
  return {
    default: {
      View: ({ children, ...props }: any) => {
        if (props.style?.alignSelf === "center") mocks.surface = props;
        return createElement("div", null, children);
      },
    },
    FadeIn: transition,
    FadeInUp: transition,
    FadeOut: transition,
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
  };
});

it("keeps glass ancestors opaque during entry and exit and still opens task details", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() => root.render(<TaskStatusBar projectId="project" />));
    expect(container.querySelector("[data-glass]")?.textContent).toContain(
      "1 in progress",
    );
    for (const transition of [mocks.surface.entering, mocks.surface.exiting]) {
      const animation =
        typeof transition === "function" ? transition : transition.build();
      const result = animation({ targetHeight: 50, currentHeight: 50 });
      expect(result.initialValues.opacity ?? 1).toBe(1);
      expect(result.animations.opacity ?? 1).toBe(1);
    }
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="View agent tasks"]')!
        .click(),
    );
    expect(container.querySelector("aside")?.textContent).toContain(
      "Explore project",
    );
    expect(container.textContent).not.toContain("Read files");
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Expand Explore project"]',
        )!
        .click(),
    );
    expect(
      Array.from(container.querySelectorAll("article")).map(
        (entry) => entry.textContent,
      ),
    ).toEqual(["**Files reviewed**", "Read files"]);
    const activity = container.querySelector<HTMLElement>(
      '[data-testid="task-activity-list"]',
    )!;
    expect(activity.style.maxHeight).toBe("220px");
    expect(activity.textContent).toBe("Read fileCompleted");
  } finally {
    act(() => root.unmount());
  }
});
