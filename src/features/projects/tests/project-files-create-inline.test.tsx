// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), finish: vi.fn() }));

vi.mock("react-native-reanimated", () => {
  const animation = {
    duration: () => animation,
    delay: () => animation,
    easing: () => animation,
    withInitialValues: () => animation,
    reduceMotion: () => animation,
  };
  return {
    default: {
      View: ({ children }: { children: ReactNode }) =>
        createElement("div", null, children),
    },
    LinearTransition: animation,
    FadeInUp: animation,
    Easing: { out: (easing: unknown) => easing, quad: vi.fn() },
    ReduceMotion: { System: "system" },
  };
});

vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-glass": "true" }, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: { value: string; onSubmitEditing: () => void }) =>
    createElement("input", {
      value: props.value,
      readOnly: true,
      onKeyDown: () => props.onSubmitEditing(),
    }),
}));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: "ios" },
  StyleSheet: { absoluteFill: { position: "absolute", inset: 0 } },
  AccessibilityInfo: {
    addEventListener: () => ({ remove: () => {} }),
    isReduceTransparencyEnabled: () => Promise.resolve(false),
  },
  ActivityIndicator: () => null,
  FlatList: ({
    ListHeaderComponent,
    data,
    renderItem,
  }: {
    ListHeaderComponent?: ReactNode;
    data: unknown[];
    renderItem: (item: { item: unknown; index: number }) => ReactNode;
  }) =>
    createElement(
      "div",
      null,
      ListHeaderComponent,
      data.map((item, index) => renderItem({ item, index })),
    ),
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    disabled,
  }: {
    children: ReactNode;
    onPress?: () => void;
    accessibilityLabel: string;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      { "aria-label": accessibilityLabel, disabled, onClick: onPress },
      children,
    ),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0 }),
}));
vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  SwipeDirection: { LEFT: "left", RIGHT: "right" },
  default: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/hooks/use-swipe-press-guard", () => ({
  useSwipePressGuard: () => ({
    onSettleEnd: vi.fn(),
    onDrag: vi.fn(),
    onSettleStart: vi.fn(),
    shouldSuppressPress: () => false,
    touchHandlers: {},
  }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) =>
    createElement("button", null, children),
}));
vi.mock("@/features/projects/components/project-file-entrance", () => ({
  ProjectFileEntrance: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/features/projects/components/project-workspace-placeholder", () => ({
  ProjectWorkspacePlaceholder: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/features/projects/components/sandbox-files", () => ({
  SandboxFiles: () => null,
}));
vi.mock("@/features/projects/hooks/use-project-workspace-dock-height", () => ({
  useProjectWorkspaceDockHeight: () => ({ dockHeight: 0 }),
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  confirmAction: vi.fn(),
}));

import { ProjectFilesList } from "@/features/projects/components/project-files-list";
import { ProjectFileCreateRow } from "@/features/projects/components/project-file-create-row";
import { ProjectWorkspaceFileCreationProvider } from "@/features/projects/hooks/use-project-workspace-file-creation";

let root: Root;
let container: HTMLDivElement;

const files = [
  { name: "app", path: "app", isDir: true, size: 0 },
  { name: "page.tsx", path: "app/page.tsx", isDir: false, size: 0 },
];

const createRow = () =>
  createElement(ProjectFileCreateRow, {
    kind: "file",
    existingNames: ["app", "page.tsx"],
    parentPath: "src",
    onSubmit: mocks.submit,
    onCancel: mocks.finish,
  });

const render = (withCreateRow: boolean) =>
  act(() =>
    root.render(
      createElement(ProjectWorkspaceFileCreationProvider, {
        projectId: "project-one",
        children: createElement(ProjectFilesList, {
          files,
          existingNames: ["app", "page.tsx"],
          parentDirectory: "src",
          createRow: withCreateRow ? createRow() : undefined,
          onDirectoryPress: vi.fn(),
          onFilePress: vi.fn(),
          onUpdate: vi.fn(),
          onDelete: vi.fn(),
        }),
      }),
    ),
  );

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  mocks.submit.mockReset().mockResolvedValue(undefined);
  mocks.finish.mockReset();
});
afterEach(() => act(() => root.unmount()));

it("shows no creation field until one is requested", () => {
  render(false);
  expect(container.querySelector("[data-glass]")).toBeNull();
  expect(container.textContent).toContain("page.tsx");
});

it("renders creation inline above the directory rows, on the glass surface", () => {
  render(true);
  const glass = container.querySelector("[data-glass]");
  expect(glass).not.toBeNull();
  expect(glass!.querySelector("input")).not.toBeNull();
  // The field is part of the list, so the rows and parent row are still there.
  expect(container.textContent).toContain("app");
  expect(container.textContent).toContain("page.tsx");
  expect(container.textContent).toContain("..");
  // The create row precedes the file rows rather than floating over them.
  expect(
    glass!.compareDocumentPosition(
      container.querySelector("input")!.parentElement!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("keeps the list interactive while the inline field is open", () => {
  render(true);
  // Creation must not disable navigation, the way the old sheet did not either.
  const rows = container.querySelectorAll("button");
  expect(rows.length).toBeGreaterThan(1);
});
