// @vitest-environment happy-dom
import { act, createElement, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectFileNameRow } from "@/features/projects/components/project-file-name-row";
import {
  ProjectWorkspaceFileCreationProvider,
  useProjectWorkspaceFileCreation,
} from "@/features/projects/hooks/use-project-workspace-file-creation";

const mocks = vi.hoisted(() => ({ alert: vi.fn() }));
let naming = false;
const NamingProbe = () => {
  naming = useProjectWorkspaceFileCreation().naming;
  return null;
};
let inputEvents: {
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  onBlur: () => void;
  className?: string;
};
vi.mock("@/components/ui/input", () => ({
  Input: (
    props: typeof inputEvents & {
      ref: Ref<HTMLInputElement>;
      value: string;
      disabled: boolean;
      invalid: boolean;
      accessibilityLabel: string;
    },
  ) => {
    inputEvents = props;
    return createElement("input", {
      ref: props.ref,
      value: props.value,
      disabled: props.disabled,
      "aria-invalid": props.invalid,
      "aria-label": props.accessibilityLabel,
      "data-class": props.className,
      readOnly: true,
    });
  },
}));
vi.mock("@/components/project-icon", () => ({
  ProjectIcon: ({
    name,
    isDirectory,
  }: {
    name: string;
    isDirectory: boolean;
  }) =>
    createElement("span", {
      "data-icon-name": name,
      "data-is-folder": isDirectory,
    }),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  ActivityIndicator: () => createElement("span", null, "Creating…"),
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  Pressable: ({
    children,
    onPressIn,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPressIn: () => void;
    onPress: () => void;
    disabled: boolean;
    accessibilityLabel: string;
  }) =>
    createElement(
      "button",
      {
        disabled,
        "aria-label": accessibilityLabel,
        onMouseDown: onPressIn,
        onClick: onPress,
      },
      children,
    ),
}));
let root: Root;
let container: HTMLDivElement;
const create = vi.fn();
const cancel = vi.fn();
const render = (
  kind: "file" | "folder" = "file",
  existingNames: readonly string[] = [],
) =>
  act(() =>
    root.render(
      createElement(ProjectWorkspaceFileCreationProvider, {
        projectId: "project-one",
        children: [
          createElement(ProjectFileNameRow, {
            mode: "create",
            kind,
            existingNames,
            parentPath: "notes",
            onSubmit: create,
            onCancel: cancel,
          }),
          createElement(NamingProbe),
        ],
      }),
    ),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  create.mockReset().mockResolvedValue(undefined);
  cancel.mockReset();
  mocks.alert.mockReset();
  naming = false;
});
afterEach(() => act(() => root.unmount()));

// Creating and renaming share this field, so both must keep the symbol strip
// reachable and both must push the browser's own search bar out of the way.
it("keeps the special-character strip while a file name is being typed", () => {
  render();
  expect((inputEvents as { keyboardSymbols?: boolean }).keyboardSymbols).toBe(
    undefined,
  );
});

it("announces that a name is in progress for as long as the row is mounted", () => {
  const props = {
    mode: "create" as const,
    kind: "file" as const,
    existingNames: [],
    parentPath: "notes",
    onSubmit: create,
    onCancel: cancel,
  };
  act(() =>
    root.render(
      createElement(ProjectWorkspaceFileCreationProvider, {
        projectId: "project-one",
        children: [
          createElement(ProjectFileNameRow, props),
          createElement(NamingProbe),
        ],
      }),
    ),
  );
  expect(naming).toBe(true);
  // Dropping the row alone must clear the flag, without unmounting the provider.
  act(() =>
    root.render(
      createElement(ProjectWorkspaceFileCreationProvider, {
        projectId: "project-one",
        children: createElement(NamingProbe),
      }),
    ),
  );
  expect(naming).toBe(false);
});

it("updates the icon as the filename changes and captures the selected parent", async () => {
  render();
  act(() => inputEvents.onChangeText("hello.tsx"));
  expect(
    container.querySelector("[data-icon-name]")?.getAttribute("data-icon-name"),
  ).toBe("notes/hello.tsx");
  await act(async () => {
    inputEvents.onSubmitEditing();
  });
  expect(create).toHaveBeenCalledWith({
    parentPath: "notes",
    name: "hello.tsx",
    kind: "file",
  });
});

it("submits only once when Enter and blur arrive together, keeping the row disabled while pending", async () => {
  let resolve!: () => void;
  create.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render();
  act(() => inputEvents.onChangeText("hello.txt"));
  await act(async () => {
    inputEvents.onSubmitEditing();
    inputEvents.onBlur();
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(container.querySelector("input")?.disabled).toBe(true);
  expect(container.querySelector("button")?.disabled).toBe(true);
  await act(async () => {
    resolve();
  });
});

it("creates a folder on blur", async () => {
  render("folder");
  act(() => inputEvents.onChangeText("drafts"));
  await act(async () => {
    inputEvents.onBlur();
  });
  expect(create).toHaveBeenCalledWith({
    parentPath: "notes",
    name: "drafts",
    kind: "folder",
  });
});

it("keeps a rejected name editable and alerts without resubmitting on another blur", async () => {
  create.mockRejectedValue(
    new Error("Conflicting filename. Please rename this file or folder."),
  );
  render();
  act(() => inputEvents.onChangeText("hello.txt"));
  await act(async () => {
    inputEvents.onSubmitEditing();
  });
  expect(mocks.alert).toHaveBeenCalledWith(
    expect.any(String),
    expect.stringContaining("Conflicting filename"),
    expect.any(Array),
  );
  expect(container.querySelector("input")?.disabled).toBe(false);
  expect(container.querySelector("input")?.value).toBe("hello.txt");
  await act(async () => {
    inputEvents.onBlur();
  });
  expect(create).toHaveBeenCalledTimes(1);
  create.mockResolvedValue(undefined);
  act(() => inputEvents.onChangeText("renamed.txt"));
  await act(async () => {
    inputEvents.onSubmitEditing();
  });
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: "renamed.txt" }),
  );
});

it("cancels blank input and makes cancel win over blur", async () => {
  render();
  await act(async () => {
    inputEvents.onBlur();
  });
  expect(cancel).toHaveBeenCalledTimes(1);
  act(() => inputEvents.onChangeText("do-not-create.txt"));
  await act(async () => {
    container
      .querySelector("button")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    inputEvents.onBlur();
    container.querySelector("button")!.click();
  });
  expect(create).not.toHaveBeenCalled();
});

it("also cancels accessibility activation without a preceding press-in event", async () => {
  render();
  act(() => inputEvents.onChangeText("do-not-create.txt"));
  await act(async () => {
    container.querySelector("button")!.click();
    inputEvents.onBlur();
  });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(create).not.toHaveBeenCalled();
});

it.each(["file", "folder"] as const)(
  "defers a conflicting %s name until submit and blocks it there until corrected",
  async (kind) => {
    render(kind, ["taken"]);
    act(() => inputEvents.onChangeText("taken"));
    // Nothing is flagged while the user is still typing.
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
      "false",
    );
    expect(container.textContent).not.toContain("already exists");
    expect(container.querySelector("input")?.disabled).toBe(false);
    expect(container.querySelector("button")?.disabled).toBe(false);
    // Submitting surfaces the conflict and blocks creation without alerting.
    await act(async () => {
      inputEvents.onSubmitEditing();
      inputEvents.onBlur();
    });
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(container.textContent).toContain("already exists");
    expect(create).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(mocks.alert).not.toHaveBeenCalled();
    // Correcting the name clears the deferred error right away.
    act(() => inputEvents.onChangeText("available"));
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
      "false",
    );
    expect(container.textContent).not.toContain("already exists");
    await act(async () => inputEvents.onSubmitEditing());
    expect(create).toHaveBeenCalledWith({
      parentPath: "notes",
      name: "available",
      kind,
    });
  },
);

it("reflects refreshed sibling names on the next submit", async () => {
  render();
  act(() => inputEvents.onChangeText("incoming.txt"));
  // A sibling arrives that makes the typed name a conflict; still deferred.
  render("file", ["incoming.txt"]);
  expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
    "false",
  );
  await act(async () => inputEvents.onBlur());
  expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
    "true",
  );
  expect(create).not.toHaveBeenCalled();
  // The sibling list refreshes and the name is free again.
  render("file", []);
  expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
    "false",
  );
  await act(async () => inputEvents.onBlur());
  expect(create).toHaveBeenCalledOnce();
});

it.each(["create", "update"] as const)(
  "hides conflict feedback when sibling names refresh during %s",
  async (mode) => {
    let reject!: (error: Error) => void;
    create.mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const renderNames = (existingNames: readonly string[]) =>
      act(() =>
        root.render(
          createElement(ProjectWorkspaceFileCreationProvider, {
            projectId: "project-one",
            children: createElement(ProjectFileNameRow, {
              kind: "file",
              mode,
              initialName: mode === "update" ? "before.txt" : "",
              existingNames,
              parentPath: "notes",
              onSubmit: create,
              onCancel: cancel,
            }),
          }),
        ),
      );
    renderNames([]);
    act(() => inputEvents.onChangeText("saved.txt"));
    await act(async () => inputEvents.onSubmitEditing());
    renderNames(["saved.txt"]);
    expect(container.querySelector("input")?.disabled).toBe(true);
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
      "false",
    );
    expect(container.textContent).not.toContain("already exists");
    expect(mocks.alert).not.toHaveBeenCalled();

    // A failed request must still restore normal feedback once loading finishes.
    renderNames([]);
    await act(async () => reject(new Error("Unable to save.")));
    expect(container.querySelector("input")?.disabled).toBe(false);
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(container.textContent).toContain("Unable to save.");
  },
);

it("keeps cancellation available while the name conflicts", async () => {
  render("file", ["taken"]);
  act(() => inputEvents.onChangeText("taken"));
  await act(async () => container.querySelector("button")!.click());
  expect(cancel).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
});

it("renders the field borderless on the glass, with no focus ring", () => {
  render();
  const className = container
    .querySelector("input")!
    .getAttribute("data-class")!;
  // The field sits directly on the glass, so nothing draws an edge or a ring.
  expect(className).toContain("border-0");
  expect(className).toContain("bg-transparent");
  expect(className).toContain("focus:outline-0");
  // A larger, easier to read name.
  expect(className).toContain("text-lg");
});

it("keeps a visible border only while a submitted name is in conflict", async () => {
  render("file", ["taken"]);
  act(() => inputEvents.onChangeText("taken"));
  // Borderless while typing, even when the name already conflicts.
  expect(
    container.querySelector("input")!.getAttribute("data-class")!,
  ).toContain("border-0");
  // A submitted conflict is the one state the user must act on, so it draws an edge.
  await act(async () => inputEvents.onSubmitEditing());
  expect(
    container.querySelector("input")!.getAttribute("data-class")!,
  ).not.toContain("border-0");
  act(() => inputEvents.onChangeText("free.txt"));
  expect(
    container.querySelector("input")!.getAttribute("data-class")!,
  ).toContain("border-0");
});

vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
