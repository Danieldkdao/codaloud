// @vitest-environment happy-dom
import { act, createElement, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectFileCreateRow } from "@/features/projects/components/project-file-create-row";
import {
  ProjectWorkspaceFileCreationProvider,
  useProjectWorkspaceFileCreation,
} from "@/features/projects/hooks/use-project-workspace-file-creation";

const mocks = vi.hoisted(() => ({ cancel: vi.fn() }));
let inputEvents: {
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  onBlur: () => void;
};

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
      View: ({
        children,
        entering,
        exiting,
        layout,
      }: {
        children: ReactNode;
        entering?: unknown;
        exiting?: unknown;
        layout?: unknown;
      }) =>
        createElement(
          "div",
          {
            "data-entering": String(entering),
            "data-exiting": String(exiting),
            "data-layout": String(Boolean(layout)),
          },
          children,
        ),
    },
    LinearTransition: animation,
    ReduceMotion: { System: "system" },
  };
});
vi.mock("@/lib/glass-animations", () => ({
  enterGlassSurface: "enter-glass",
  exitGlassSurface: "exit-glass",
}));
// The glass background is presentation only; this test covers the field's behavior.
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-glass": "true" }, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: typeof inputEvents & { ref: Ref<HTMLInputElement> }) => {
    inputEvents = props;
    return createElement("input", { ref: props.ref, readOnly: true });
  },
}));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  ActivityIndicator: () => null,
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
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

let root: Root;
let container: HTMLDivElement;
const create = vi.fn();

const render = (
  props: Partial<React.ComponentProps<typeof ProjectFileCreateRow>> = {},
) =>
  act(() =>
    root.render(
      createElement(ProjectWorkspaceFileCreationProvider, {
        projectId: "project-one",
        children: createElement(ProjectFileCreateRow, {
          kind: "file",
          existingNames: [],
          parentPath: "notes",
          onSubmit: create,
          onCancel: mocks.cancel,
          ...props,
        }),
      }),
    ),
  );

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  create.mockReset().mockResolvedValue(undefined);
  mocks.cancel.mockReset();
});
afterEach(() => act(() => root.unmount()));

it("presents the field on the liquid glass surface", () => {
  render();
  expect(container.querySelector("[data-glass]")).not.toBeNull();
  expect(
    container.querySelector("[data-glass]")!.querySelector("input"),
  ).not.toBeNull();
});

it("animates between the row and the input state", () => {
  render();
  const surface = container.querySelector("[data-entering]")!;
  expect(surface.getAttribute("data-entering")).toBe("enter-glass");
  expect(surface.getAttribute("data-exiting")).toBe("exit-glass");
  expect(surface.getAttribute("data-layout")).toBe("true");
});

it("defers the conflict until submit and keeps typing available", async () => {
  render({ existingNames: ["taken"] });
  act(() => inputEvents.onChangeText("taken"));
  // No error while the user is still typing.
  expect(container.textContent).not.toContain("already exists");
  await act(async () => {
    inputEvents.onSubmitEditing();
  });
  // The conflict surfaces on submit and blocks creation.
  expect(container.textContent).toContain("already exists");
  expect(create).not.toHaveBeenCalled();
  act(() => inputEvents.onChangeText("fresh.txt"));
  await act(async () => {
    inputEvents.onSubmitEditing();
  });
  expect(create).toHaveBeenCalledWith({
    parentPath: "notes",
    name: "fresh.txt",
    kind: "file",
  });
});

it("cancels the inline field without creating anything", async () => {
  render();
  act(() => inputEvents.onChangeText("discarded.txt"));
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label^="Cancel"]')!
      .click();
  });
  expect(mocks.cancel).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
});

// The Files screen mounts the row only while the provider reports a `kind` and
// wires cancel to `finish`; this drives that real path so a broken `finish` fails.
let beginCreation: (kind: "file" | "folder") => void;
const CreateHarness = () => {
  const creation = useProjectWorkspaceFileCreation();
  beginCreation = creation.begin;
  return creation.kind
    ? createElement(ProjectFileCreateRow, {
        kind: creation.kind,
        existingNames: [],
        parentPath: "notes",
        onSubmit: create,
        onCancel: creation.finish,
      })
    : null;
};

it("dismisses the inline field when cancel reaches the provider's finish", async () => {
  await act(async () =>
    root.render(
      createElement(ProjectWorkspaceFileCreationProvider, {
        projectId: "project-one",
        children: createElement(CreateHarness),
      }),
    ),
  );
  act(() => beginCreation("file"));
  expect(container.querySelector("input")).not.toBeNull();
  act(() => inputEvents.onChangeText("discarded.txt"));
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label^="Cancel"]')!
      .click();
  });
  // finish() clears the provider's kind, so the row unmounts.
  expect(container.querySelector("input")).toBeNull();
  expect(create).not.toHaveBeenCalled();
});
