// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AgentScreen from "@/app/projects/[projectId]/agent";
import { ProjectAgentActivityList } from "@/features/projects/components/project-agent-activity-list";
import type { AgentTaskRecord } from "@/features/agent/types";
import { ProjectAgentSearch } from "../components/project-agent-search";

vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => "https://codaloud.test",
}));

const state = vi.hoisted(() => ({
  dismissKeyboard: vi.fn(),
  tasks: [] as AgentTaskRecord[],
  metrics: undefined as
    | { screenY: number; screenX: number; height: number; width: number }
    | undefined,
  listeners: new Map<string, Set<(event: unknown) => void>>(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ projectId: "project" }),
}));
vi.mock("@/features/agent/hooks/use-agent-tasks", () => ({
  useAgentTasks: () => state.tasks,
}));
vi.mock("@/features/agent/components/task-activity-card", () => ({
  TaskActivityCard: ({ task }: { task: AgentTaskRecord }) => (
    <div>
      {task.request.title}
      {task.request.instruction}
      {task.event.summary}
    </div>
  ),
}));
vi.mock("@/features/agent/components/task-activity-sheet", () => ({
  TaskActivitySheet: () => null,
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    style,
    testID,
    className,
  }: {
    children?: ReactNode;
    style?: any;
    testID?: string;
    className?: string;
  }) => (
    <div
      data-testid={testID}
      data-class={className}
      style={Object.assign({}, ...[style].flat(Infinity).filter(Boolean))}
    >
      {children}
    </div>
  ),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    keyboardDismissMode,
    keyboardShouldPersistTaps,
  }: {
    data: AgentTaskRecord[];
    renderItem: (info: { item: AgentTaskRecord }) => ReactNode;
    ListHeaderComponent: ReactNode;
    ListEmptyComponent: ReactNode;
    keyboardDismissMode: string;
    keyboardShouldPersistTaps: string;
  }) => (
    <div
      data-list
      data-dismiss-mode={keyboardDismissMode}
      data-persist-taps={keyboardShouldPersistTaps}
    >
      {ListHeaderComponent}
      {data.length
        ? data.map((item) => (
            <div
              key={item.request.requestId}
              data-activity={item.request.requestId}
            >
              {renderItem({ item })}
            </div>
          ))
        : ListEmptyComponent}
    </div>
  ),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
  Keyboard: {
    dismiss: state.dismissKeyboard,
    metrics: () => state.metrics,
    scheduleLayoutAnimation: vi.fn(),
    addListener: (name: string, listener: (event: unknown) => void) => {
      const listeners = state.listeners.get(name) ?? new Set();
      listeners.add(listener);
      state.listeners.set(name, listeners);
      return { remove: () => listeners.delete(listener) };
    },
  },
  StyleSheet: {
    flatten: (style: unknown) =>
      Object.assign({}, ...[style].flat(Infinity).filter(Boolean)),
  },
  useWindowDimensions: () => ({ width: 440, height: 956 }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  CodeText: ({ children }: { children: ReactNode }) => <code>{children}</code>,
  HeadingText: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) => (
    <div data-glass>{children}</div>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChangeText,
    accessibilityLabel,
    onSubmitEditing,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    accessibilityLabel: string;
    onSubmitEditing: () => void;
  }) => (
    <input
      value={value}
      aria-label={accessibilityLabel}
      onInput={(event) => onChangeText(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSubmitEditing();
      }}
    />
  ),
}));
vi.mock("@/features/projects/hooks/use-workspace-loading-preview", () => ({
  useWorkspaceLoadingPreview: () => false,
}));
vi.mock("@/features/projects/components/project-workspace-state", () => ({
  ProjectWorkspaceState: () => <span>Loading activity…</span>,
}));

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(createElement(AgentScreen)));
const search = (query: string) => {
  const input = container.querySelector<HTMLInputElement>(
    '[aria-label="Search activity"]',
  );
  expect(input).not.toBeNull();
  act(() => {
    input!.value = query;
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const titles = () =>
  [...container.querySelectorAll("[data-activity]")].map(
    (row) => row.textContent,
  );
beforeEach(() => {
  vi.stubEnv("EXPO_OS", "ios");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.tasks = [
    {
      request: {
        requestId: "one",
        projectId: "project",
        title: "Explore project",
        instruction: "Read files",
      },
      event: { status: "running", logs: ["Running: Browse folder"] },
    },
    {
      request: {
        requestId: "two",
        projectId: "project",
        title: "Publish branch",
        instruction: "Push my changes",
      },
      event: {
        status: "completed",
        logs: ["Completed Push commits"],
        summary: "**Branch published**",
      },
    },
    {
      request: {
        requestId: "three",
        projectId: "project",
        title: "Fix build",
        instruction: "Run checks",
      },
      event: { status: "failed", logs: [], summary: "Missing configuration" },
    },
    {
      request: {
        requestId: "other",
        projectId: "elsewhere",
        title: "Other project",
        instruction: "Unrelated",
      },
      event: { status: "running", logs: [] },
    },
  ] as AgentTaskRecord[];
  state.metrics = undefined;
  state.dismissKeyboard.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllEnvs();
});
it("keeps a permanent glass search below the existing activity list", () => {
  render();
  expect(titles()).toHaveLength(3);
  expect(container.textContent).not.toContain("Other project");
  expect(
    container.querySelector('[data-glass] [aria-label="Search activity"]'),
  ).not.toBeNull();
  expect(container.querySelector("[data-list] input")).toBeNull();
  expect(container.querySelector('[aria-label="Microphone"]')).toBeNull();
  expect(
    container.querySelector("[data-list]")?.getAttribute("data-dismiss-mode"),
  ).toBe("on-drag");
  expect(
    container.querySelector("[data-list]")?.getAttribute("data-persist-taps"),
  ).toBe("handled");
});
it.each([
  ["  EXPLORE  ", "Explore project", 1],
  ["push my changes", "Publish branch", 1],
  ["branch published", "Publish branch", 1],
  ["Needs attention", "Fix build", 1],
  ["Browse folder", "Explore project", 1],
])("filters local visible activity by %s", (query, expected, count) => {
  render();
  search(query);
  expect(titles()).toHaveLength(count);
  expect(titles().join(" ")).toContain(expected);
});
it("shows a no-match state and restores all logs when cleared", () => {
  render();
  search("nothing-matches-this");
  expect(titles()).toHaveLength(0);
  expect(container.textContent).toContain("No matching activity");
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Clear activity search"]')!
      .click(),
  );
  expect(titles()).toHaveLength(3);
  expect(container.querySelector("input")?.value).toBe("");
  search("   ");
  expect(titles()).toHaveLength(3);
});
it("retains the original empty-activity message when there are no logs", () => {
  act(() => root.render(<ProjectAgentActivityList tasks={[]} />));
  expect(container.textContent).toContain("No activity yet");
});
it("applies the active search to new live task updates without a preview delay", () => {
  const tasks = state.tasks;
  state.tasks = [];
  render();
  search("Explore");
  expect(container.textContent).not.toContain("Loading activity…");
  state.tasks = tasks;
  render();
  expect(titles()).toHaveLength(1);
  expect(container.textContent).toContain("Explore project");
});

it("floats the reusable glass search without an opaque footer in log sheets", () => {
  act(() =>
    root.render(
      <ProjectAgentSearch query="" onQueryChange={() => {}} floating />,
    ),
  );
  const footer = container.querySelector<HTMLElement>(
    '[data-testid="agent-activity-search"]',
  )!;
  expect(footer.style.position).toBe("absolute");
  expect(footer.style.bottom).toBe("0px");
  expect(footer.getAttribute("data-class") ?? "").not.toContain(
    "bg-background",
  );
  expect(footer.querySelector("[data-glass] input")).not.toBeNull();
});
it("keeps the search above changing keyboard frames and restores the viewport after dismissal", () => {
  state.metrics = { screenX: 0, screenY: 636, width: 440, height: 320 };
  render();
  const inset = () =>
    Number.parseFloat(
      container.querySelector<HTMLElement>(
        '[data-testid="project-agent-viewport"]',
      )?.style.paddingBottom || "0",
    );
  expect(inset()).toBe(320);
  act(() =>
    state.listeners
      .get("keyboardWillChangeFrame")
      ?.forEach((listener) =>
        listener({
          endCoordinates: { screenY: 590, height: 366 },
          duration: 250,
        }),
      ),
  );
  expect(inset()).toBe(366);
  // The modal's true window origin is 62pt even if Fabric measures it as zero.
  expect(62 + 894 - inset() - 34).toBeLessThanOrEqual(590);
  act(() =>
    state.listeners
      .get("keyboardWillHide")
      ?.forEach((listener) => listener({ duration: 250 })),
  );
  expect(inset()).toBe(0);
});
it("dismisses the keyboard with the search key without clearing the query", () => {
  render();
  search("dashboard");
  act(() =>
    container
      .querySelector("input")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
  );
  expect(state.dismissKeyboard).toHaveBeenCalledOnce();
  expect(container.querySelector("input")?.value).toBe("dashboard");
});
