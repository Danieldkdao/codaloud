// @vitest-environment happy-dom
import { act, createElement, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectFileCreateRow } from "@/features/projects/components/project-file-create-row";

const mocks = vi.hoisted(() => ({ alert: vi.fn() }));
let inputEvents: { onChangeText: (text: string) => void; onSubmitEditing: () => void; onBlur: () => void };
vi.mock("@/components/ui/input", () => ({ Input: (props: typeof inputEvents & { ref: Ref<HTMLInputElement>; value: string; disabled: boolean; accessibilityLabel: string }) => {
  inputEvents = props;
  return createElement("input", { ref: props.ref, value: props.value, disabled: props.disabled, "aria-label": props.accessibilityLabel, readOnly: true });
} }));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: ({ name, isDirectory }: { name: string; isDirectory: boolean }) => createElement("span", { "data-icon-name": name, "data-is-folder": isDirectory }) }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => createElement("span", null, children) }));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert }, ActivityIndicator: () => createElement("span", null, "Creating…"),
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Pressable: ({ children, onPressIn, onPress, disabled, accessibilityLabel }: { children: ReactNode; onPressIn: () => void; onPress: () => void; disabled: boolean; accessibilityLabel: string }) =>
    createElement("button", { disabled, "aria-label": accessibilityLabel, onMouseDown: onPressIn, onClick: onPress }, children),
}));
let root: Root;
let container: HTMLDivElement;
const create = vi.fn();
const cancel = vi.fn();
const render = (kind: "file" | "folder" = "file") => act(() => root.render(createElement(ProjectFileCreateRow, {
  kind, parentPath: "notes", onCreate: create, onCancel: cancel,
})));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  create.mockReset().mockResolvedValue(undefined);
  cancel.mockReset(); mocks.alert.mockReset();
});
afterEach(() => act(() => root.unmount()));

it("updates the icon as the filename changes and captures the selected parent", async () => {
  render();
  act(() => inputEvents.onChangeText("hello.tsx"));
  expect(container.querySelector("[data-icon-name]")?.getAttribute("data-icon-name")).toBe("notes/hello.tsx");
  await act(async () => { inputEvents.onSubmitEditing(); });
  expect(create).toHaveBeenCalledWith({ parentPath: "notes", name: "hello.tsx", kind: "file" });
});

it("submits only once when Enter and blur arrive together, keeping the row disabled while pending", async () => {
  let resolve!: () => void;
  create.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
  render();
  act(() => inputEvents.onChangeText("hello.txt"));
  await act(async () => { inputEvents.onSubmitEditing(); inputEvents.onBlur(); });
  expect(create).toHaveBeenCalledTimes(1);
  expect(container.querySelector("input")?.disabled).toBe(true);
  expect(container.querySelector("button")?.disabled).toBe(true);
  await act(async () => { resolve(); });
});

it("creates a folder on blur", async () => {
  render("folder");
  act(() => inputEvents.onChangeText("drafts"));
  await act(async () => { inputEvents.onBlur(); });
  expect(create).toHaveBeenCalledWith({ parentPath: "notes", name: "drafts", kind: "folder" });
});

it("keeps a rejected name editable and alerts without resubmitting on another blur", async () => {
  create.mockRejectedValue(new Error("Conflicting filename. Please rename this file or folder."));
  render();
  act(() => inputEvents.onChangeText("hello.txt"));
  await act(async () => { inputEvents.onSubmitEditing(); });
  expect(mocks.alert).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("Conflicting filename"), expect.any(Array));
  expect(container.querySelector("input")?.disabled).toBe(false);
  expect(container.querySelector("input")?.value).toBe("hello.txt");
  await act(async () => { inputEvents.onBlur(); });
  expect(create).toHaveBeenCalledTimes(1);
  create.mockResolvedValue(undefined);
  act(() => inputEvents.onChangeText("renamed.txt"));
  await act(async () => { inputEvents.onSubmitEditing(); });
  expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ name: "renamed.txt" }));
});

it("cancels blank input and makes cancel win over blur", async () => {
  render();
  await act(async () => { inputEvents.onBlur(); });
  expect(cancel).toHaveBeenCalledTimes(1);
  act(() => inputEvents.onChangeText("do-not-create.txt"));
  await act(async () => {
    container.querySelector("button")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    inputEvents.onBlur();
    container.querySelector("button")!.click();
  });
  expect(create).not.toHaveBeenCalled();
});

it("also cancels accessibility activation without a preceding press-in event", async () => {
  render();
  act(() => inputEvents.onChangeText("do-not-create.txt"));
  await act(async () => { container.querySelector("button")!.click(); inputEvents.onBlur(); });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(create).not.toHaveBeenCalled();
});
