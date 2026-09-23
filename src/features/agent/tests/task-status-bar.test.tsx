// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskStatusBar } from "../components/task-status-bar";
import AgentScreen from "@/app/projects/[projectId]/agent";

const mocks = vi.hoisted(() => ({
  surface: {} as any,
  sheets: {} as Record<string, any>,
  scroll: {} as any,
  animations: {} as Record<string, any>,
  tasks: [] as any[],
  scrollToEnd: vi.fn(),
  scrollTo: vi.fn(),
  search: {} as any,
  reducedMotion: false,
  navigate: vi.fn(),
  taskSearch: {} as any,
  projectId: "project",
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ projectId: mocks.projectId }),
  useRouter: () => ({ navigate: mocks.navigate }),
}));
vi.mock("@/features/projects/hooks/use-workspace-loading-preview", () => ({
  useWorkspaceLoadingPreview: () => false,
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/keyboard-aware-view", () => ({
  KeyboardAwareView: ({ children, testID }: any) =>
    createElement("div", { "data-testid": testID }, children),
}));
vi.mock("@/lib/utils", async () => {
  const { clsx } = await import("clsx");
  const { twMerge } = await import("tailwind-merge");
  return { cn: (...items: Parameters<typeof clsx>) => twMerge(clsx(...items)) };
});
vi.mock("../hooks/use-agent-tasks", () => ({
  useAgentTasks: () => mocks.tasks,
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "inherit" }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("react-native-svg", () => {
  const Node = ({ children }: any) => createElement("span", null, children);
  return {
    default: Node,
    Defs: Node,
    LinearGradient: Node,
    Stop: Node,
    Rect: Node,
  };
});
vi.mock("@react-native-masked-view/masked-view", () => ({
  default: ({ children, maskElement }: any) =>
    createElement("div", null, maskElement, children),
}));
vi.mock("@/components/markdown-text", () => ({
  MarkdownText: ({ text }: any) => createElement("article", null, text),
}));
vi.mock("@/features/projects/components/project-agent-search", () => ({
  ProjectAgentSearch: (props: any) => {
    if (props.floating) mocks.search = { onValueChange: props.onQueryChange };
    else mocks.taskSearch = props;
    return createElement(
      "section",
      { "data-glass-search": true, "data-floating": props.floating },
      createElement("input", { "aria-label": "Search activity" }),
    );
  },
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
  ContentSheet: (props: any) => {
    const id = props.children.props.testID;
    mocks.sheets[id] = props;
    return createElement(
      "aside",
      { "data-open": props.open, hidden: !props.open },
      props.children,
    );
  },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  ActivityIndicator: () => null,
  Keyboard: { dismiss: vi.fn() },
  FlatList: ({ data, renderItem, keyExtractor, ListEmptyComponent }: any) =>
    createElement(
      "div",
      { "data-list": true },
      data.length
        ? data.map((item: any) =>
            createElement(
              "div",
              { key: keyExtractor(item) },
              renderItem({ item }),
            ),
          )
        : ListEmptyComponent,
    ),
  View: ({ children, testID }: any) =>
    createElement("div", { "data-testid": testID }, children),
  ScrollView: ({ children, testID, ref, ...props }: any) => {
    useImperativeHandle(ref, () => ({
      scrollToEnd: mocks.scrollToEnd,
      scrollTo: mocks.scrollTo,
    }));
    if (testID === "task-activity-list") mocks.scroll = props;
    return createElement("div", { "data-testid": testID }, children);
  },
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
        if (props.testID) mocks.animations[props.testID] = props;
        return createElement("div", { "data-testid": props.testID }, children);
      },
    },
    FadeIn: transition,
    FadeInUp: transition,
    FadeInDown: transition,
    FadeOut: transition,
    LinearTransition: transition,
    ReduceMotion: { System: "system" },
    useReducedMotion: () => mocks.reducedMotion,
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
  };
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const render = () => act(() => root.render(<AgentScreen />));
const click = (label: string) =>
  act(() => {
    const button = container.querySelector<HTMLButtonElement>(
      `[aria-label="${label}"]`,
    );
    expect(button, label).not.toBeNull();
    button!.click();
  });
const detail = () => mocks.sheets["task-activity-detail"];
const showDetail = () => {
  click("Expand Explore project");
  click("View Agent Activity");
  expect(detail().open).toBe(true);
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasks = [
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
  ];
  mocks.sheets = {};
  mocks.animations = {};
  mocks.scrollToEnd.mockClear();
  mocks.scrollTo.mockClear();
  mocks.search = {};
  mocks.reducedMotion = false;
  mocks.navigate.mockClear();
  mocks.projectId = "project";
  container = document.createElement("div");
  root = createRoot(container);
  render();
});
afterEach(() => act(() => root.unmount()));

it("keeps glass opaque and replaces the inline list with stats and an animated disclosure", () => {
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
  click("View agent tasks");
  expect(mocks.navigate).toHaveBeenCalledWith({
    pathname: "/projects/[projectId]/agent",
    params: { projectId: "project" },
  });
  expect(container.querySelector("aside")).toBeNull();
  render();
  click("Expand Explore project");
  const visible = container.querySelector(
    '[data-testid="project-agent-viewport"]',
  )!;
  expect(visible.textContent).toContain("1 action");
  expect(visible.textContent).toContain("1 completed");
  expect(visible.textContent).toContain("Read files");
  expect(visible.textContent).toContain("**Files reviewed**");
  expect(
    visible.querySelector('[data-testid="task-activity-list"]'),
  ).toBeNull();
  expect(mocks.animations["task-activity-card"].layout).toBeDefined();
  expect(mocks.animations["task-card-details"].entering).toBeDefined();
  expect(mocks.animations["task-card-details"].exiting).toBeDefined();
  click("Collapse Explore project");
  expect(visible.textContent).not.toContain("Read files");
});

it("keeps the Agent screen and expanded card mounted beneath the log sheet", () => {
  showDetail();
  expect(
    container.querySelector('aside[data-open="true"]')?.textContent,
  ).toContain("Explore project");
  click("Back to agent activity");
  expect(detail().open).toBe(false);
  expect(
    container.querySelector('[data-testid="project-agent-viewport"]'),
  ).not.toBeNull();
  act(() => detail().onDismiss());
  expect(container.querySelector("aside")).toBeNull();
  expect(
    container.querySelector('[data-testid="project-agent-viewport"]')
      ?.textContent,
  ).toContain("View Agent Activity");
  act(() => detail().onDismiss());
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("leaves the Agent screen visible after swipe or Android back dismissal", () => {
  showDetail();
  act(() => detail().onOpenChange(false));
  expect(
    container.querySelector('[data-testid="project-agent-viewport"]'),
  ).not.toBeNull();
  act(() => detail().onDismiss());
  expect(container.querySelector("aside")).toBeNull();
});

it("preserves task search and expansion when the log sheet is dismissed", () => {
  act(() => mocks.taskSearch.onQueryChange("Explore"));
  showDetail();
  click("Back to agent activity");
  act(() => detail().onDismiss());
  expect(mocks.taskSearch.query).toBe("Explore");
  expect(
    container.querySelector('[aria-label="Collapse Explore project"]'),
  ).not.toBeNull();
});

it("does not leave a previous project's log sheet open after changing projects", () => {
  showDetail();
  mocks.projectId = "elsewhere";
  render();
  expect(container.querySelector("aside")).toBeNull();
  expect(container.textContent).not.toContain("Explore project");
});

it("streams live task updates without keeping a stale selected task snapshot", () => {
  showDetail();
  expect(mocks.animations["task-activity-entry-0"].entering).toBeUndefined();
  mocks.tasks = [
    {
      ...mocks.tasks[0],
      event: {
        status: "failed",
        logs: [...mocks.tasks[0].event.logs, "Running: Read branches"],
        summary: "**Try again**",
      },
    },
  ];
  render();
  const visible = container.querySelector('aside[data-open="true"]')!;
  expect(visible.textContent).toContain("Read branches");
  expect(visible.textContent).toContain("Not completed");
  expect(visible.textContent).not.toContain("**Try again**");
  expect(visible.textContent).not.toContain("2 actions");
  expect(mocks.animations["task-activity-entry-2"].entering).toBeDefined();
  click("Back to agent activity");
  act(() => detail().onDismiss());
  expect(
    container.querySelector('[data-testid="project-agent-viewport"]')
      ?.textContent,
  ).toContain("View Full Activity");
  expect(
    container.querySelector('[data-testid="project-agent-viewport"]')
      ?.textContent,
  ).toContain("**Try again**");
});

it("follows new events but does not drag users away from older activity", () => {
  showDetail();
  act(() => mocks.scroll.onContentSizeChange(390, 1000));
  expect(mocks.scrollToEnd).toHaveBeenCalled();
  mocks.scrollToEnd.mockClear();
  act(() => mocks.scroll.onScrollBeginDrag());
  act(() =>
    mocks.scroll.onScroll({
      nativeEvent: {
        contentOffset: { y: 0 },
        contentSize: { height: 1000 },
        layoutMeasurement: { height: 400 },
      },
    }),
  );
  act(() => mocks.scroll.onContentSizeChange(390, 1200));
  expect(mocks.scrollToEnd).not.toHaveBeenCalled();
  act(() =>
    mocks.scroll.onScroll({
      nativeEvent: {
        contentOffset: { y: 800 },
        contentSize: { height: 1200 },
        layoutMeasurement: { height: 400 },
      },
    }),
  );
  mocks.scrollToEnd.mockClear();
  act(() => mocks.scroll.onContentSizeChange(390, 1300));
  expect(mocks.scrollToEnd).toHaveBeenCalled();
});

it("honors reduced motion for automatic scrolling", () => {
  mocks.reducedMotion = true;
  showDetail();
  act(() => mocks.scroll.onContentSizeChange(390, 1000));
  expect(mocks.scrollToEnd).toHaveBeenCalledWith({ animated: false });
});

it("does not mistake intermediate automatic scroll events for a user scrolling away", () => {
  showDetail();
  act(() => mocks.scroll.onContentSizeChange(390, 1000));
  mocks.scrollToEnd.mockClear();
  act(() => mocks.scroll.onMomentumScrollBegin());
  act(() =>
    mocks.scroll.onScroll({
      nativeEvent: {
        contentOffset: { y: 100 },
        contentSize: { height: 1000 },
        layoutMeasurement: { height: 400 },
      },
    }),
  );
  act(() => mocks.scroll.onContentSizeChange(390, 1100));
  expect(mocks.scrollToEnd).toHaveBeenCalled();
});

it("shows a useful empty state before the first event", () => {
  mocks.tasks[0].event.logs = [];
  render();
  showDetail();
  expect(
    container.querySelector('aside[data-open="true"]')?.textContent,
  ).toContain("Waiting for the first update");
  expect(
    container.querySelector('aside[data-open="true"]')?.textContent,
  ).not.toContain("0 actions");
});

it("keeps the log sheet to a title, back button, search, and activity rows", () => {
  showDetail();
  const visible = container.querySelector('aside[data-open="true"]')!;
  expect(
    visible.querySelector(
      '[data-glass-search][data-floating="true"] [aria-label="Search activity"]',
    ),
  ).not.toBeNull();
  expect(visible.textContent).toContain("Read file");
  for (const text of [
    "Your request",
    "Read files",
    "Summary",
    "**Files reviewed**",
    "1 action",
    "Working",
    "Latest activity",
  ]) {
    expect(visible.textContent).not.toContain(text);
  }
  expect(visible.querySelectorAll("button")).toHaveLength(1);
});

it("filters live logs case-insensitively, pauses auto-follow during search, and restores all rows on clear", () => {
  showDetail();
  act(() => mocks.search.onValueChange("  BRANCHES  "));
  expect(
    container.querySelector('aside[data-open="true"]')?.textContent,
  ).toContain("No matching activity");
  expect(mocks.scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  mocks.tasks[0] = {
    ...mocks.tasks[0],
    event: {
      ...mocks.tasks[0].event,
      logs: [...mocks.tasks[0].event.logs, "Running: Read branches"],
    },
  };
  render();
  let visible = container.querySelector('aside[data-open="true"]')!;
  expect(visible.textContent).toContain("Read branches");
  expect(visible.textContent).not.toContain("Read file");
  mocks.scrollToEnd.mockClear();
  act(() => mocks.scroll.onContentSizeChange(390, 1000));
  expect(mocks.scrollToEnd).not.toHaveBeenCalled();
  act(() => mocks.search.onValueChange("completed"));
  visible = container.querySelector('aside[data-open="true"]')!;
  expect(visible.textContent).toContain("Read file");
  expect(visible.textContent).not.toContain("Read branches");
  act(() => mocks.search.onValueChange(""));
  visible = container.querySelector('aside[data-open="true"]')!;
  expect(visible.textContent).toContain("Read file");
  expect(visible.textContent).toContain("Read branches");
});

it("handles a native dismissal without a preceding presentation change", () => {
  showDetail();
  act(() => detail().onDismiss());
  expect(container.querySelector("aside")).toBeNull();
  expect(
    container.querySelector('[data-testid="project-agent-viewport"]'),
  ).not.toBeNull();
});

it("selects the requested task and excludes other projects", () => {
  mocks.tasks.push(
    {
      ...mocks.tasks[0],
      request: {
        ...mocks.tasks[0].request,
        requestId: "second",
        title: "Publish branch",
      },
      event: {
        status: "completed",
        logs: ["Completed Push commits"],
        summary: "Published",
      },
    },
    {
      ...mocks.tasks[0],
      request: {
        ...mocks.tasks[0].request,
        projectId: "elsewhere",
        requestId: "third",
        title: "Other project",
      },
    },
  );
  render();
  expect(
    container.querySelector('[data-testid="project-agent-viewport"]')
      ?.textContent,
  ).not.toContain("Other project");
  click("Expand Publish branch");
  click("View Full Activity");
  const visible = container.querySelector('aside[data-open="true"]')!;
  expect(visible.textContent).toContain("Publish branch");
  expect(visible.textContent).toContain("Push commits");
  expect(visible.textContent).not.toContain("Explore project");
});
