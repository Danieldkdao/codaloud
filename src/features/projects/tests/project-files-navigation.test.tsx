// @vitest-environment happy-dom
import { act, createElement, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FilesScreen from "@/app/projects/[projectId]/files";
import { ProjectFilesList } from "@/features/projects/components/project-files-list";
import { getDirectoryFiles } from "@/features/projects/lib/files";
import type { SwipeableProps } from "react-native-gesture-handler/ReanimatedSwipeable";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";

const fileCreation = vi.hoisted(() => ({ kind: null as ProjectFileKind | null, begin: vi.fn(), finish: vi.fn() }));
vi.mock("@/features/projects/hooks/use-project-workspace-file-creation", () => ({ useProjectWorkspaceFileCreation: () => fileCreation }));

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), selectFile: vi.fn(), confirm: vi.fn(), delete: vi.fn(), deletePending: false, deleteVariables: { parentPath: "", name: "app", kind: "folder" }, update: vi.fn(), create: vi.fn(), success: vi.fn(), alert: vi.fn(), updatePending: false }));
vi.mock("@/features/projects/hooks/use-project-workspace-current-file", () => ({ useProjectWorkspaceCurrentFile: () => ({ filePath: null, version: 0, setFilePath: mocks.selectFile, refreshFile: vi.fn() }) }));
vi.mock("@/features/projects/hooks/use-project-workspace-dock-height", () => ({ useProjectWorkspaceDockHeight: () => ({ dockHeight: 0, setDockHeight: vi.fn() }) }));
let inputEvents: { onChangeText: (text: string) => void; onSubmitEditing: () => void; onBlur: () => void };
vi.mock("@/lib/utils", () => ({ confirmAction: mocks.confirm }));
vi.mock("@/components/ui/input", () => ({ Input: (props: typeof inputEvents & { ref: Ref<HTMLInputElement>; value: string; disabled: boolean; invalid: boolean; accessibilityLabel: string }) => {
  inputEvents = props;
  return createElement("input", { ref: props.ref, value: props.value, disabled: props.disabled, "aria-invalid": props.invalid, "aria-label": props.accessibilityLabel, readOnly: true });
} }));
vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  default: (props: SwipeableProps) => createElement("div", { "data-swipe-enabled": String(props.enabled) }, props.children,
    props.renderRightActions?.({ value: 1 } as never, { value: -120 } as never, {} as never)),
}));

const files = [
  { name: "app", path: "app", isDir: true, size: 0 },
  { name: "package.json", path: "package.json", isDir: false, size: 0 },
  { name: "layout.tsx", path: "app/layout.tsx", isDir: false, size: 0 },
  { name: "page.tsx", path: "app/page.tsx", isDir: false, size: 0 },
  { name: "dashboard", path: "app/dashboard", isDir: true, size: 0 },
  { name: "page.tsx", path: "app/dashboard/page.tsx", isDir: false, size: 0 },
];
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ projectId: "project-one" }), useRouter: () => ({ navigate: mocks.navigate }) }));
vi.mock("@/features/projects/hooks/use-project-files", () => ({ useProjectFiles: (_id: string, path: string) => ({
  query: { data: getDirectoryFiles(files, path), isPending: false, isError: false, isFetching: false, refetch: vi.fn() },
  update: { mutateAsync: mocks.update, isPending: mocks.updatePending, variables: { parentPath: "", previousName: "app" } },
  creation: { mutateAsync: mocks.create },
  deletion: { mutateAsync: mocks.delete, isPending: mocks.deletePending, variables: mocks.deleteVariables },
}) }));
vi.mock("@/components/ui/button", () => ({ Button: ({ onPress, accessibilityLabel, disabled }: { onPress: () => void; accessibilityLabel: string; disabled: boolean }) =>
  createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled }),
}));
vi.mock("@/hooks/use-success-feedback", () => ({ useSuccessFeedback: () => mocks.success }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/features/projects/components/project-workspace-state", () => ({ ProjectWorkspaceState: () => null }));

vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  ActivityIndicator: () => createElement("span", { "data-native-spinner": true }),
  View: ({ children, className, pointerEvents, accessibilityRole, accessibilityLabel, accessibilityState, accessibilityElementsHidden, importantForAccessibility }: {
    children: ReactNode; className?: string; pointerEvents?: string; accessibilityRole?: string; accessibilityLabel?: string;
    accessibilityState?: { busy?: boolean }; accessibilityElementsHidden?: boolean; importantForAccessibility?: string;
  }) => createElement("div", {
    className, role: accessibilityRole, "aria-label": accessibilityLabel, "aria-busy": accessibilityState?.busy,
    "data-pointer-events": pointerEvents, "data-accessibility-hidden": accessibilityElementsHidden,
    "data-important-for-accessibility": importantForAccessibility,
  }, children),
  FlatList: ({ data, renderItem, ListHeaderComponent }: { data: unknown[]; renderItem: (info: { item: unknown }) => ReactNode; ListHeaderComponent?: ReactNode }) =>
    createElement("div", null, ListHeaderComponent, data.map((item, index) =>
      createElement("div", { key: index }, renderItem({ item })))),
  Pressable: ({ children, onPress, accessibilityLabel, disabled }: {
    children: ReactNode; onPress?: () => void; accessibilityLabel?: string; disabled?: boolean;
  }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled }, children),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/features/projects/components/project-workspace-placeholder", () => ({
  ProjectWorkspacePlaceholder: () => createElement("div", null, "No files created"),
}));
vi.mock("@/features/projects/components/sandbox-files", () => ({ SandboxFiles: () => null }));

let container: HTMLDivElement;
let root: Root;
const click = (label: string) => {
  const button = [...container.querySelectorAll("button")]
    .find((element) => element.getAttribute("aria-label") === label);
  expect(button).toBeDefined();
  act(() => button!.click());
};

beforeEach(() => {
  fileCreation.kind = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.updatePending = false;
  mocks.deletePending = false;
  mocks.deleteVariables = { parentPath: "", name: "app", kind: "folder" };
  mocks.delete.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(FilesScreen)));
});
afterEach(() => act(() => root.unmount()));

it("replaces the current directory and supports drilling into nested folders", () => {
  expect(container.textContent).toContain("package.json");
  click("app, folder");
  expect(container.textContent).not.toContain("package.json");
  expect(container.textContent).not.toContain("components");
  expect(container.textContent).toContain("layout.tsx");
  expect(container.querySelector('[aria-label="dashboard, folder"]')?.textContent).toBe("dashboard");
  click("dashboard, folder");
  expect(container.textContent).toBe("..page.tsx");
});

it("selects the full file path and opens the Code tab from any folder", () => {
  click("package.json, file");
  expect(mocks.selectFile).toHaveBeenLastCalledWith("package.json");
  expect(mocks.navigate).toHaveBeenLastCalledWith({ pathname: "/projects/[projectId]/code", params: { projectId: "project-one" } });
  click("app, folder");
  expect(mocks.navigate).toHaveBeenCalledTimes(1);
  click("page.tsx, file");
  expect(mocks.selectFile).toHaveBeenLastCalledWith("app/page.tsx");
  expect(mocks.navigate).toHaveBeenCalledTimes(2);
});


it("shows a parent row only below the root and goes up exactly one level", () => {
  expect(container.querySelector('[aria-label="Go to parent directory"]')).toBeNull();
  click("app, folder");
  expect(container.querySelector("button")?.textContent).toBe("..");
  click("dashboard, folder");
  click("Go to parent directory");
  expect(container.textContent).toContain("layout.tsx");
  expect(container.textContent).not.toContain("package.json");
  click("Go to parent directory");
  expect(container.textContent).toContain("package.json");
  expect(container.querySelector('[aria-label="Go to parent directory"]')).toBeNull();
});

it("keeps parent navigation available alongside the empty state", () => {
  const onDirectoryPress = vi.fn();
  act(() => root.render(createElement(ProjectFilesList, {
    files: [], existingNames: [], parentDirectory: "/workspace/project", onDirectoryPress, onFilePress: mocks.selectFile, onUpdate: mocks.update, onDelete: mocks.delete,
  })));
  expect(container.textContent).toContain("No files created");
  click("Go to parent directory");
  expect(onDirectoryPress).toHaveBeenCalledWith("/workspace/project");
});

it("prefills rename with the selected name and cancels without changing it", () => {
  click("Update package.json");
  expect(container.querySelector('input[aria-label="File name"]')?.getAttribute("value")).toBe("package.json");
  act(() => inputEvents.onChangeText("renamed.json"));
  click("Cancel update");
  expect(container.querySelector("input")).toBeNull();
  expect(container.textContent).toContain("package.json");
});

it("submits a folder rename and closes only after the mutation succeeds", async () => {
  let resolve!: () => void;
  mocks.update.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
  click("Update app");
  expect(container.querySelector('input[aria-label="Folder name"]')?.getAttribute("value")).toBe("app");
  act(() => inputEvents.onChangeText("source"));
  await act(async () => inputEvents.onSubmitEditing());
  expect(mocks.update).toHaveBeenCalledWith({ parentPath: "", previousName: "app", name: "source", kind: "folder" });
  expect(container.querySelector("input")?.disabled).toBe(true);
  expect(mocks.success).not.toHaveBeenCalled();
  mocks.updatePending = true;
  act(() => root.render(createElement(FilesScreen)));
  expect(container.querySelector("input")?.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="package.json, file"]')?.disabled).toBe(true);
  await act(async () => resolve());
  expect(container.querySelector("input")).toBeNull();
  expect(mocks.success).toHaveBeenCalledWith("Folder updated");
});

it("keeps a failed rename editable with the entered name and retries the same source", async () => {
  mocks.update.mockRejectedValueOnce(new Error("Choose another name."));
  click("app, folder");
  click("Update layout.tsx");
  act(() => inputEvents.onChangeText("taken.tsx"));
  await act(async () => inputEvents.onSubmitEditing());
  expect(container.querySelector("input")?.value).toBe("taken.tsx");
  expect(container.querySelector("input")?.disabled).toBe(false);
  expect(container.textContent).toContain("Choose another name.");
  expect(mocks.success).not.toHaveBeenCalled();
  act(() => inputEvents.onChangeText("renamed.tsx"));
  await act(async () => inputEvents.onSubmitEditing());
  expect(mocks.update).toHaveBeenLastCalledWith({ parentPath: "app", previousName: "layout.tsx", name: "renamed.tsx", kind: "file" });
  expect(container.querySelector("input")).toBeNull();
  expect(mocks.success).toHaveBeenCalledWith("File updated");
});

it("closes an unchanged name without making a mutation", async () => {
  click("Update package.json");
  expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe("false");
  await act(async () => inputEvents.onSubmitEditing());
  expect(container.querySelector("input")).toBeNull();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});

it("checks rename against sibling files and folders as the user types", async () => {
  click("app, folder");
  click("Update layout.tsx");
  for (const name of ["page.tsx", "dashboard"]) {
    act(() => inputEvents.onChangeText(name));
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("already exists");
    await act(async () => { inputEvents.onSubmitEditing(); inputEvents.onBlur(); });
    expect(mocks.update).not.toHaveBeenCalled();
  }
  // This name exists at the root, but is available in app/.
  act(() => inputEvents.onChangeText("package.json"));
  expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe("false");
  await act(async () => inputEvents.onSubmitEditing());
  expect(mocks.update).toHaveBeenCalledWith({ parentPath: "app", previousName: "layout.tsx", name: "package.json", kind: "file" });
});

it("passes the loaded directory names into the create form", async () => {
  fileCreation.kind = "file";
  act(() => root.render(createElement(FilesScreen)));
  act(() => inputEvents.onChangeText("app"));
  expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
  await act(async () => { inputEvents.onSubmitEditing(); inputEvents.onBlur(); });
  expect(mocks.create).not.toHaveBeenCalled();
});

it("deletes a folder only after confirmation and waits for success feedback", async () => {
  let resolve!: () => void;
  mocks.delete.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
  click("Delete app");
  expect(mocks.confirm).toHaveBeenCalledWith("Delete folder?", expect.stringContaining("all files and folders inside it"), expect.objectContaining({ actionText: "Delete" }));
  expect(mocks.delete).not.toHaveBeenCalled();
  await act(async () => mocks.confirm.mock.calls.at(-1)![2].onConfirmPress());
  expect(mocks.delete).toHaveBeenCalledWith({ parentPath: "", name: "app", kind: "folder" });
  expect(mocks.success).not.toHaveBeenCalled();
  await act(async () => resolve());
  expect(mocks.success).toHaveBeenCalledWith("Folder deleted");
});

it("confirms deletion of only the selected file", () => {
  click("Delete package.json");
  expect(mocks.confirm).toHaveBeenCalledWith("Delete file?", expect.stringContaining('"package.json"'), expect.objectContaining({ actionText: "Delete" }));
  expect(mocks.confirm.mock.calls.at(-1)![1]).not.toContain("inside");
});

it("shows deletion errors, keeps the item visible, and allows a deliberate retry", async () => {
  mocks.delete.mockRejectedValueOnce(new Error("Refresh the folder."));
  click("app, folder");
  click("Delete layout.tsx");
  await act(async () => mocks.confirm.mock.calls.at(-1)![2].onConfirmPress());
  expect(mocks.delete).toHaveBeenCalledWith({ parentPath: "app", name: "layout.tsx", kind: "file" });
  expect(mocks.alert).toHaveBeenCalledWith("Couldn't delete this item", "Refresh the folder.");
  expect(container.textContent).toContain("layout.tsx");
  expect(mocks.success).not.toHaveBeenCalled();
  click("Delete layout.tsx");
  await act(async () => mocks.confirm.mock.calls.at(-1)![2].onConfirmPress());
  expect(mocks.delete).toHaveBeenCalledTimes(2);
  expect(mocks.success).toHaveBeenCalledWith("File deleted");
});

it("disables navigation and file actions while deletion is pending", () => {
  click("app, folder");
  mocks.deletePending = true;
  act(() => root.render(createElement(FilesScreen)));
  for (const label of ["Go to parent directory", "dashboard, folder", "Delete layout.tsx", "Update page.tsx"]) {
    expect(container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.disabled).toBe(true);
  }
});

it.each([
  { parentPath: "", name: "app", kind: "folder" },
  { parentPath: "app", name: "layout.tsx", kind: "file" },
])("covers only the deleting $kind with a spinner and restores interactions on failure", async (input) => {
  let reject!: (error: Error) => void;
  mocks.delete.mockImplementation(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  if (input.parentPath) click("app, folder");
  click(`Delete ${input.name}`);
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  await act(async () => mocks.confirm.mock.calls.at(-1)![2].onConfirmPress());
  mocks.deleteVariables = input;
  mocks.deletePending = true;
  act(() => root.render(createElement(FilesScreen)));

  const overlay = container.querySelector(`[role="progressbar"][aria-label="Deleting ${input.name}"]`);
  expect(overlay).not.toBeNull();
  expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
  expect(overlay?.getAttribute("aria-busy")).toBe("true");
  expect(overlay?.className).toContain("absolute inset-0");
  expect(overlay?.className).toContain("bg-background/70");
  expect(overlay?.querySelector('[data-native-spinner]')).not.toBeNull();
  const content = overlay?.previousElementSibling;
  expect(content?.getAttribute("data-pointer-events")).toBe("none");
  expect(content?.getAttribute("data-accessibility-hidden")).toBe("true");
  expect(content?.getAttribute("data-important-for-accessibility")).toBe("no-hide-descendants");
  expect(content?.querySelector('[data-swipe-enabled="false"]')).not.toBeNull();
  for (const label of [`${input.name}, ${input.kind}`, `Update ${input.name}`, `Delete ${input.name}`]) {
    expect(container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.disabled).toBe(true);
    click(label);
  }
  expect(mocks.delete).toHaveBeenCalledTimes(1);
  expect(mocks.update).not.toHaveBeenCalled();
  await act(async () => reject(new Error("Please try again.")));
  mocks.deletePending = false;
  act(() => root.render(createElement(FilesScreen)));
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  expect(container.querySelector<HTMLButtonElement>(`[aria-label="Delete ${input.name}"]`)?.disabled).toBe(false);
  expect(mocks.alert).toHaveBeenCalledWith("Couldn't delete this item", "Please try again.");
});
