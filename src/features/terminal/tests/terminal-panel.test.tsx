// @vitest-environment happy-dom
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({
      children,
      className,
      style,
      accessibilityLabel,
    }: {
      children?: import("react").ReactNode;
      className?: string;
      style?: unknown;
      accessibilityLabel?: string;
    }) =>
      createElement(
        "div",
        {
          className,
          "aria-label": accessibilityLabel,
          "data-panel-style": JSON.stringify(style),
        },
        children,
      ),
  },
  useSharedValue: (value: number) => {
    mocks.animatedHeight = { value };
    return mocks.animatedHeight;
  },
  useAnimatedStyle: (style: () => unknown) => style(),
  withSpring: (value: number) => value,
}));
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pan: null as null | Record<
    string,
    (_event: unknown, gesture: { dy: number }) => void
  >,
  animatedHeight: { value: 0 },
  onHeightChange: vi.fn(),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(),
  releasePanel: vi.fn(),
  retainPanel: vi.fn(),
  sendInput: vi.fn(async () => {}),
  runInPty: vi.fn(async () => {}),
  cancelRun: vi.fn(async () => {}),
  resize: vi.fn(async () => {}),
  runCommand: vi.fn(async () => ({ exitCode: 0, output: "ran" })),
  sync: vi.fn(async () => ({
    sandboxId: "one",
    conflicts: [] as string[],
    failures: [] as string[],
    uploaded: 0,
    downloaded: 0,
    deleted: 0,
    localDeleted: 0,
  })),
  clear: vi.fn(),
  onClose: vi.fn(),
  onSyncFiles: vi.fn(),
  push: vi.fn(),
  navigate: vi.fn(),
  dismissKeyboard: vi.fn(),
  snapshot: {
    status: "ready",
    access: null as "plan" | "credits" | "billing" | null,
    output: "$",
    clearGeneration: 0,
    error: null as string | null,
    syncGeneration: 0,
    syncMessage: null as string | null,
    syncing: false,
    downloadedPaths: [],
    deletedPaths: [],
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push, navigate: mocks.navigate }),
}));
vi.mock("@/features/terminal/actions/terminal-session", () => ({
  projectTerminalSession: () => ({
    subscribe: () => () => {},
    getSnapshot: () => mocks.snapshot,
    connect: mocks.connect,
    disconnect: mocks.disconnect,
    retainPanel: mocks.retainPanel,
    sendInput: mocks.sendInput,
    runInPty: mocks.runInPty,
    cancelRun: mocks.cancelRun,
    resize: mocks.resize,
    runCommand: mocks.runCommand,
    sync: mocks.sync,
    clear: mocks.clear,
    retry: mocks.connect,
  }),
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => undefined,
}));
vi.mock("@/hooks/use-theme", () => ({
  useThemeColor: () => "green",
}));
vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({
    label,
    sections,
  }: import("@/components/ui/native-select").NativeSelectProps) =>
    createElement(
      "div",
      { "aria-label": label },
      sections.flatMap((section) =>
        section.options.map((option) =>
          createElement(
            "button",
            {
              key: option.value,
              "aria-label": option.label,
              onClick: option.onSelect,
            },
            option.label,
          ),
        ),
      ),
    ),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/lib/utils", () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(" "),
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  useEditorPreferences: () => ({
    preferences: { theme: "GitHub Dark", fontSize: 17 },
  }),
}));
vi.mock("../components/terminal-surface", () => ({
  TerminalSurface: ({ fontSize }: { fontSize: number }) =>
    createElement("div", { "data-terminal-font-size": fontSize }),
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: mocks.dismissKeyboard },
  ActivityIndicator: () => createElement("span", null, "Syncing"),
  PanResponder: {
    create: (config: typeof mocks.pan) => {
      mocks.pan = config;
      return { panHandlers: {} };
    },
  },
  useWindowDimensions: () => ({ height: 800, width: 400 }),
  View: ({
    children,
    className,
    style,
  }: {
    children?: ReactNode;
    className?: string;
    style?: unknown;
  }) =>
    createElement(
      "div",
      { className, "data-view-style": JSON.stringify(style) },
      children,
    ),
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-scrollable-prompt": true }, children),
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, onClick: onPress, disabled },
      children,
    ),
}));

import { TerminalPanel } from "../components/terminal-panel";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.snapshot = {
    ...mocks.snapshot,
    status: "ready",
    access: null,
    error: null,
    syncing: false,
    syncMessage: null,
  };
  mocks.retainPanel.mockReturnValue(mocks.releasePanel);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      createElement(TerminalPanel, {
        projectId: "project",
        activeFilePath: "main.py",
        dockHeight: 80,
        height: 260,
        onHeightChange: mocks.onHeightChange,
        onClose: mocks.onClose,
        onSyncFiles: mocks.onSyncFiles,
      }),
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  expect(mocks.releasePanel).toHaveBeenCalledOnce();
});

it("does not reserve terminal height for an idle sync message", () => {
  expect(container.textContent).not.toContain("Project files are syncing");
  expect(container.textContent).not.toContain(
    "All project files are up to date",
  );
});
it("offers a reconnect action after an idle connection drops", async () => {
  mocks.snapshot.status = "closed";
  act(() =>
    root.render(
      createElement(TerminalPanel, {
        projectId: "project",
        activeFilePath: "main.py",
        dockHeight: 80,
        height: 260,
        onHeightChange: mocks.onHeightChange,
        onClose: mocks.onClose,
        onSyncFiles: mocks.onSyncFiles,
      }),
    ),
  );
  mocks.connect.mockClear();
  const reconnect = container.querySelector<HTMLButtonElement>(
    '[aria-label="Reconnect terminal"]',
  );
  expect(reconnect).not.toBeNull();
  await act(async () => reconnect!.click());
  expect(mocks.connect).toHaveBeenCalledOnce();
});
it("leaves the dock and microphone reachable while the terminal is mounted", () => {
  const panel = container.querySelector('[aria-label="Project terminal"]')!;
  const style = JSON.parse(panel.getAttribute("data-panel-style")!);
  expect(style[0].bottom).toBe(80);
  expect(style[1].height).toBe(260);
});

it("runs the current file in the PTY after syncing local edits", async () => {
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="Run current file"]')!
      .click();
  });
  expect(mocks.runInPty).toHaveBeenCalledWith(
    "python3 'main.py'\n",
    expect.objectContaining({ sandboxId: "one" }),
  );
  expect(mocks.sync).toHaveBeenCalledOnce();
});

it("replaces Run with Stop while a file is running and interrupts it", async () => {
  mocks.runInPty.mockImplementationOnce(() => new Promise(() => {}));
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="Run current file"]')!
      .click();
    await Promise.resolve();
  });
  expect(
    container.querySelector('[aria-label="Stop current file"]'),
  ).not.toBeNull();
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="Stop current file"]')!
      .click();
  });
  expect(mocks.cancelRun).toHaveBeenCalledOnce();
});

it("tracks a drag continuously and settles at its released height", () => {
  expect(mocks.animatedHeight.value).toBe(260);
  act(() => {
    mocks.pan!.onPanResponderGrant(null, { dy: 0 });
    mocks.pan!.onPanResponderMove(null, { dy: -80 });
  });
  expect(mocks.animatedHeight.value).toBe(340);
  expect(mocks.onHeightChange).not.toHaveBeenCalled();
  act(() => mocks.pan!.onPanResponderRelease(null, { dy: -80 }));
  expect(mocks.onHeightChange).toHaveBeenCalledWith(340);
});

it("positions terminal content above the dock", () => {
  const panel = container.querySelector('[aria-label="Project terminal"]')!;
  const style = JSON.parse(panel.getAttribute("data-panel-style")!);
  expect(style[0].bottom).toBe(80);
  expect(style[1].height).toBe(260);
  const content = container.querySelector(".editor-github-dark")!;
  expect(content.getAttribute("data-view-style")).toBeNull();
});

it("does not run a stale file when its local and sandbox copies conflict", async () => {
  mocks.sync.mockResolvedValueOnce({
    sandboxId: "one",
    conflicts: ["main.py"],
    failures: [],
    uploaded: 0,
    downloaded: 0,
    deleted: 0,
    localDeleted: 0,
  });
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="Run current file"]')!
      .click();
  });
  expect(mocks.sendInput).not.toHaveBeenCalled();
  expect(container.textContent).toContain("main.py has conflicting changes");
});

it("uses the editor palette and font size for the native terminal", () => {
  expect(container.querySelector(".editor-github-dark")).not.toBeNull();
  expect(
    container.querySelector("[data-terminal-font-size='13']"),
  ).not.toBeNull();
  expect(container.querySelector("input")).toBeNull();
});

it("shows a stable plan prompt instead of mounting the terminal after access is denied", () => {
  mocks.snapshot = {
    ...mocks.snapshot,
    status: "blocked",
    access: "plan",
    error: "A paid plan is required for the terminal.",
  };
  act(() =>
    root.render(
      createElement(TerminalPanel, {
        projectId: "project",
        activeFilePath: "main.py",
        dockHeight: 80,
        height: 260,
        onHeightChange: mocks.onHeightChange,
        onClose: mocks.onClose,
        onSyncFiles: mocks.onSyncFiles,
      }),
    ),
  );

  expect(container.textContent).toContain("Pro or Premium");
  expect(container.querySelector("[data-terminal-font-size]")).toBeNull();
  expect(container.querySelector("[data-scrollable-prompt]")).not.toBeNull();
  container
    .querySelector<HTMLButtonElement>('[aria-label="View plans"]')!
    .click();
  expect(mocks.push).toHaveBeenCalledWith("/billing");
});

it("keeps project routes available while the terminal covers the dock and syncs", () => {
  mocks.snapshot = {
    ...mocks.snapshot,
    syncing: true,
    syncMessage: "Downloading 64 / 512 files…",
  };
  act(() =>
    root.render(
      createElement(TerminalPanel, {
        projectId: "project",
        activeFilePath: "main.py",
        dockHeight: 80,
        height: 260,
        onHeightChange: mocks.onHeightChange,
        onClose: mocks.onClose,
        onSyncFiles: mocks.onSyncFiles,
      }),
    ),
  );
  expect(container.textContent).toContain("Downloading 64 / 512 files…");
  for (const [label, destination] of [
    ["Files", "files"],
    ["Git", "git"],
    ["Agent log", "agent"],
  ]) {
    container
      .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
      .click();
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      pathname: `/projects/[projectId]/${destination}`,
      params: { projectId: "project" },
    });
  }
  expect(mocks.dismissKeyboard).toHaveBeenCalledTimes(3);
});
