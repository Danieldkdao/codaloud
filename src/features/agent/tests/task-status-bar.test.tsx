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
  views: {} as Record<string, any>,
  tasks: [] as any[],
  scrollToEnd: vi.fn(),
  scrollTo: vi.fn(),
  search: {} as any,
  reducedMotion: false,
  navigate: vi.fn(),
  taskSearch: {} as any,
  projectId: "project",
  touch: {} as any,
  swipe: {} as any,
  buttons: {} as Record<string, any>,
  review: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  alert: vi.fn(),
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
  return {
    cn: (...items: Parameters<typeof clsx>) => twMerge(clsx(...items)),
    confirmAction: mocks.confirm,
    alert: mocks.alert,
  };
});
vi.mock("../task-runtime", () => ({
  agentTasks: { setReviewed: mocks.review, removeHistory: mocks.remove },
}));
vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  default: (props: any) => {
    mocks.swipe = props;
    return createElement(
      "div",
      null,
      props.children,
      props.renderRightActions?.(),
    );
  },
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons[props.accessibilityLabel] = props;
    return createElement(
      "button",
      {
        "aria-label": props.accessibilityLabel,
        onClick: props.onPress,
        disabled: props.disabled || props.loading,
      },
      props.children,
    );
  },
}));
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
  View: ({ children, testID, ...props }: any) => {
    if (props.onTouchStart) mocks.touch = props;
    if (testID) mocks.views[testID] = props;
    return createElement("div", { "data-testid": testID }, children);
  },
  ScrollView: ({ children, testID, ref, ...props }: any) => {
    useImperativeHandle(ref, () => ({
      scrollToEnd: mocks.scrollToEnd,
      scrollTo: mocks.scrollTo,
    }));
    if (testID === "task-activity-list") mocks.scroll = props;
    return createElement("div", { "data-testid": testID }, children);
  },
  Pressable: ({ children, onPress, accessibilityLabel, ...props }: any) => {
    mocks.buttons[accessibilityLabel] = props;
    return createElement(
      "button",
      { onClick: onPress, "aria-label": accessibilityLabel },
      children,
    );
  },
}));
vi.mock("react-native-reanimated", async () => {
  const { FlatList } = await import("react-native");
  const transition = {
    duration: () => transition,
    reduceMotion: () => transition,
    springify: () => transition,
    dampingRatio: () => transition,
    build: () => () => ({
      initialValues: { opacity: 0 },
      animations: { opacity: 0 },
    }),
  };
  return {
    default: {
      FlatList,
      View: ({ children, ...props }: any) => {
        if (props.onTouchStart) mocks.touch = props;
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
  mocks.views = {};
  mocks.scrollToEnd.mockClear();
  mocks.scrollTo.mockClear();
  mocks.search = {};
  mocks.reducedMotion = false;
  mocks.navigate.mockClear();
  mocks.projectId = "project";
  mocks.touch = {};
  mocks.buttons = {};
  mocks.review.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.confirm.mockReset();
  mocks.alert.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
  render();
});
afterEach(() => act(() => root.unmount()));

it("animates the entire swipe row on entry and exit, without losing its touch guard", () => {
  const row = mocks.animations["task-history-row"];
  expect(row?.entering).toBeDefined();
  expect(row?.exiting).toBeDefined();
  expect(row?.onTouchStart).toBeTypeOf("function");
});

it("keeps both swipe actions square and full-height", () => {
  for (const label of [
    "Mark reviewed: Explore project",
    "Delete history: Explore project",
  ]) {
    const props = mocks.buttons[label];
    expect(props.className).toContain("h-full");
    expect(props.className).toContain("aspect-square");
    expect(props.className).not.toMatch(/\bw-16\b/);
  }
});

it("squares only the card's action-side corners until the swipe fully closes", () => {
  const cardClasses = () => mocks.animations["task-activity-card"].className;
  expect(cardClasses()).toContain("rounded-2xl");
  expect(cardClasses()).not.toContain("rounded-r-none");

  act(() => mocks.swipe.onSwipeableOpenStartDrag());
  expect(cardClasses()).toContain("rounded-r-none");
  act(() => {
    mocks.swipe.onSwipeableWillOpen();
    mocks.swipe.onSwipeableOpen();
  });
  expect(cardClasses()).toContain("rounded-2xl");
  expect(cardClasses()).toContain("rounded-r-none");

  act(() => mocks.swipe.onSwipeableWillClose());
  expect(cardClasses()).toContain("rounded-r-none");
  act(() => mocks.swipe.onSwipeableClose());
  expect(cardClasses()).not.toContain("rounded-r-none");

  // A short drag that snaps back must restore the closed appearance too.
  act(() => mocks.swipe.onSwipeableOpenStartDrag());
  expect(cardClasses()).toContain("rounded-r-none");
  act(() => {
    mocks.swipe.onSwipeableWillClose();
    mocks.swipe.onSwipeableClose();
  });
  expect(cardClasses()).not.toContain("rounded-r-none");
});

it("hides reviewed tasks from the status bar but keeps them in history, and restores unreviewed tasks", () => {
  mocks.tasks[0] = { ...mocks.tasks[0], reviewed: true };
  act(() => root.render(<TaskStatusBar projectId="project" />));
  expect(container.textContent).toBe("");
  render();
  expect(container.textContent).toContain("Explore project");
  expect(
    container.querySelector('[data-testid="task-reviewed-overlay"]'),
  ).not.toBeNull();
  expect(container.textContent).not.toContain("Reviewed");
  mocks.tasks[0] = { ...mocks.tasks[0], reviewed: false };
  act(() => root.render(<TaskStatusBar projectId="project" />));
  expect(container.textContent).toContain("1 in progress");
});

it("uses a non-interactive reviewed overlay without disabling the card or swipe actions", async () => {
  expect(
    container.querySelector('[data-testid="task-reviewed-overlay"]'),
  ).toBeNull();
  mocks.tasks[0] = { ...mocks.tasks[0], reviewed: true };
  render();
  const overlay = mocks.views["task-reviewed-overlay"];
  expect(overlay).toMatchObject({
    pointerEvents: "none",
    accessible: false,
    accessibilityElementsHidden: true,
    importantForAccessibility: "no-hide-descendants",
  });
  expect(overlay.className).toContain("absolute inset-0");
  expect(mocks.buttons["Expand Explore project"].accessibilityValue).toEqual({
    text: "Reviewed",
  });
  expect(
    mocks.buttons["Expand Explore project"].accessibilityState.disabled,
  ).not.toBe(true);
  click("Expand Explore project");
  expect(
    container.querySelector('[data-testid="task-card-details"]'),
  ).not.toBeNull();
  click("View Agent Activity");
  expect(detail().open).toBe(true);
  await act(async () => click("Mark unreviewed: Explore project"));
  expect(mocks.review).toHaveBeenCalledWith("request", false);
  mocks.tasks[0] = { ...mocks.tasks[0], reviewed: false };
  render();
  expect(
    container.querySelector('[data-testid="task-reviewed-overlay"]'),
  ).toBeNull();
  expect(
    mocks.buttons["Collapse Explore project"].accessibilityValue,
  ).toBeUndefined();
});

const touchRow = (phase: string, x = 200, y = 40) =>
  act(() => mocks.touch[phase]?.({ nativeEvent: { pageX: x, pageY: y } }));

it.each([
  [false, "Open", false],
  [false, "Open", true],
  [true, "Open", false],
  [true, "Open", true],
  [false, "Close", false],
  [false, "Close", true],
])(
  "accepts the first review tap during %s/%s settling, finished before release=%s",
  async (reviewed, direction, finishBeforePress) => {
    mocks.tasks[0] = { ...mocks.tasks[0], reviewed };
    render();
    touchRow("onTouchStart");
    act(() => mocks.swipe.onSwipeableOpenStartDrag());
    act(() => mocks.swipe[`onSwipeableWill${direction}`]());
    touchRow("onTouchEnd");
    touchRow("onTouchStart");
    if (finishBeforePress) act(() => mocks.swipe[`onSwipeable${direction}`]());
    touchRow("onTouchEnd");
    await act(async () =>
      click(`Mark ${reviewed ? "unreviewed" : "reviewed"}: Explore project`),
    );
    expect(mocks.review).toHaveBeenCalledExactlyOnceWith("request", !reviewed);
  },
);

it("does not let a late animation callback invalidate a new review touch", async () => {
  touchRow("onTouchStart");
  act(() => mocks.swipe.onSwipeableOpenStartDrag());
  touchRow("onTouchEnd");
  touchRow("onTouchStart");
  act(() => mocks.swipe.onSwipeableWillOpen());
  touchRow("onTouchEnd");
  await act(async () => click("Mark reviewed: Explore project"));
  expect(mocks.review).toHaveBeenCalledExactlyOnceWith("request", true);
});

it("accepts the first delete tap during settling but still requires confirmation", () => {
  mocks.tasks[0] = {
    ...mocks.tasks[0],
    event: { ...mocks.tasks[0].event, status: "completed" },
  };
  render();
  touchRow("onTouchStart");
  act(() => {
    mocks.swipe.onSwipeableOpenStartDrag();
    mocks.swipe.onSwipeableWillOpen();
  });
  touchRow("onTouchEnd");
  click("Delete history: Explore project");
  expect(mocks.confirm).not.toHaveBeenCalled();
  touchRow("onTouchStart");
  click("Delete history: Explore project");
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it.each(["Open", "Close"])(
  "still suppresses the original %s drag release after snapping finishes",
  (direction) => {
    touchRow("onTouchStart");
    act(() => mocks.swipe[`onSwipeable${direction}StartDrag`]());
    touchRow("onTouchEnd");
    act(() => {
      mocks.swipe[`onSwipeableWill${direction}`]();
      mocks.swipe[`onSwipeable${direction}`]();
    });
    click("Mark reviewed: Explore project");
    expect(mocks.review).not.toHaveBeenCalled();
  },
);

it("ignores repeated review presses while the first write is pending", async () => {
  let finish!: () => void;
  mocks.review.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  touchRow("onTouchStart");
  click("Mark reviewed: Explore project");
  touchRow("onTouchStart");
  click("Mark reviewed: Explore project");
  expect(mocks.review).toHaveBeenCalledOnce();
  await act(async () => finish());
});

it.each([
  [9, 0],
  [-9, 0],
  [0, 9],
  [0, -9],
  [10, 0],
  [-10, 0],
  [0, 10],
  [0, -10],
])("accepts a first review tap with small drift %s,%s", async (x, y) => {
  touchRow("onTouchStart");
  touchRow("onTouchMove", 200 + x, 40 + y);
  touchRow("onTouchEnd");
  await act(async () => click("Mark reviewed: Explore project"));
  expect(mocks.review).toHaveBeenCalledExactlyOnceWith("request", true);
});

it.each([
  [11, 0],
  [-11, 0],
  [0, 11],
  [0, -11],
])(
  "still blocks review after dragging %s,%s, even if the finger returns",
  async (x, y) => {
    touchRow("onTouchStart");
    touchRow("onTouchMove", 200 + x, 40 + y);
    touchRow("onTouchMove", 200, 40);
    touchRow("onTouchEnd");
    click("Mark reviewed: Explore project");
    expect(mocks.review).not.toHaveBeenCalled();
    touchRow("onTouchStart");
    await act(async () => click("Mark reviewed: Explore project"));
    expect(mocks.review).toHaveBeenCalledExactlyOnceWith("request", true);
  },
);

it("keeps cancelled action touches suppressed after animation completion", () => {
  touchRow("onTouchStart");
  touchRow("onTouchCancel");
  act(() => mocks.swipe.onSwipeableOpen());
  click("Mark reviewed: Explore project");
  expect(mocks.review).not.toHaveBeenCalled();
});

it("does not expand a card or open its logs when releasing a swipe", () => {
  touchRow("onTouchStart");
  touchRow("onTouchMove", 100);
  act(() => {
    mocks.swipe.onSwipeableWillOpen?.();
    mocks.swipe.onSwipeableOpen?.();
  });
  click("Expand Explore project");
  expect(
    container.querySelector('[data-testid="task-card-details"]'),
  ).toBeNull();
  touchRow("onTouchStart");
  click("Expand Explore project");
  touchRow("onTouchStart");
  touchRow("onTouchMove", 200, 80);
  click("View Agent Activity");
  expect(mocks.sheets["task-activity-detail"]).toBeUndefined();
  touchRow("onTouchStart");
  click("View Agent Activity");
  expect(detail().open).toBe(true);
});

it("guards review/delete releases, toggles review, and confirms deletion", async () => {
  mocks.tasks[0] = {
    ...mocks.tasks[0],
    event: { ...mocks.tasks[0].event, status: "completed" },
  };
  render();
  touchRow("onTouchStart");
  touchRow("onTouchMove", 100);
  click("Mark reviewed: Explore project");
  click("Delete history: Explore project");
  expect(mocks.review).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
  touchRow("onTouchStart");
  await act(async () => click("Mark reviewed: Explore project"));
  expect(mocks.review).toHaveBeenCalledWith("request", true);
  mocks.tasks[0] = { ...mocks.tasks[0], reviewed: true };
  render();
  touchRow("onTouchStart");
  await act(async () => click("Mark unreviewed: Explore project"));
  expect(mocks.review).toHaveBeenLastCalledWith("request", false);
  touchRow("onTouchStart");
  click("Delete history: Explore project");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.confirm).toHaveBeenCalledOnce();
  await act(async () => mocks.confirm.mock.calls[0][2].onConfirmPress());
  expect(mocks.remove).toHaveBeenCalledWith("request");
  expect(mocks.buttons["Delete history: Explore project"].className).toContain(
    "h-full",
  );
  expect(mocks.buttons["Delete history: Explore project"].className).toContain(
    "rounded-r-2xl",
  );
});

it("keeps active history undeletable and reports persistence errors", async () => {
  click("Delete history: Explore project");
  expect(mocks.confirm).not.toHaveBeenCalled();
  mocks.review.mockRejectedValueOnce(new Error("Disk full"));
  await act(async () => click("Mark reviewed: Explore project"));
  expect(mocks.alert).toHaveBeenCalledWith("Disk full");
});

it("exposes accessible review/delete actions even after a suppressed touch", async () => {
  mocks.tasks[0] = {
    ...mocks.tasks[0],
    event: { ...mocks.tasks[0].event, status: "failed" },
  };
  render();
  touchRow("onTouchStart");
  touchRow("onTouchMove", 100);
  const props = mocks.buttons["Expand Explore project"];
  expect(props.accessibilityActions).toContainEqual({
    name: "review",
    label: "Mark reviewed",
  });
  await act(async () =>
    props.onAccessibilityAction({ nativeEvent: { actionName: "review" } }),
  );
  expect(mocks.review).toHaveBeenCalledWith("request", true);
  act(() =>
    props.onAccessibilityAction({ nativeEvent: { actionName: "delete" } }),
  );
  expect(mocks.confirm).toHaveBeenCalledOnce();
});

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
