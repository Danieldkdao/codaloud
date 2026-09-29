// @vitest-environment happy-dom
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({
      children,
      className,
    }: {
      children?: import("react").ReactNode;
      className?: string;
    }) => createElement("div", { className }, children),
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
  snapshot: {
    status: "ready",
    output: "$",
    clearGeneration: 0,
    error: null,
    syncGeneration: 0,
    syncMessage: null,
    downloadedPaths: [],
    deletedPaths: [],
  },
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
  }),
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => undefined,
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
  }: {
    children?: ReactNode;
    className?: string;
  }) => createElement("div", { className }, children),
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

it("explains that files may take time to sync", () => {
  expect(container.textContent).toContain("Files may take a moment to sync");
  expect(container.textContent).toContain("Tap Sync to refresh");
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
    container.querySelector("[data-terminal-font-size='17']"),
  ).not.toBeNull();
  expect(container.querySelector("input")).toBeNull();
});
