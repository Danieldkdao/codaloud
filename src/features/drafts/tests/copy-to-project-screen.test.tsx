// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const id = "00000000-0000-4000-8000-000000000001";
const project = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Project",
  setupStatus: "ready" as const,
  setupError: null,
  githubRepositoryId: null,
  lastOpenedFilePath: null,
  lastOpenedAt: null,
  createdAt: "2026-09-28T00:00:00.000Z",
  updatedAt: "2026-09-28T00:00:00.000Z",
};
const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  remove: vi.fn(),
  back: vi.fn(),
  dismissTo: vi.fn(),
  alert: vi.fn(),
  success: vi.fn(),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ draftId: id }),
  useRouter: () => ({ back: mocks.back, dismissTo: mocks.dismissTo }),
}));
vi.mock("react-native", () => ({
  ScrollView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  KeyboardAvoidingView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  Platform: { OS: "ios" },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "button",
      { onClick: onPress, disabled, "aria-label": accessibilityLabel },
      children,
    ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChangeText,
  }: {
    value: string;
    onChangeText: (value: string) => void;
  }) =>
    createElement("input", {
      value,
      onChange: (event: Event) =>
        onChangeText((event.target as HTMLInputElement).value),
    }),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
  HeadingText: ({ children }: { children?: ReactNode }) =>
    createElement("h2", null, children),
}));
vi.mock("@/features/drafts/components/draft-project-select", () => ({
  DraftProjectSelect: ({
    onSelect,
  }: {
    onSelect: (value: typeof project) => void;
  }) =>
    createElement(
      "button",
      { onClick: () => onSelect(project) },
      "Choose project",
    ),
}));
vi.mock("@/features/drafts/components/draft-folder-select", () => ({
  DraftFolderSelect: ({
    onChoose,
    onBackToProjects,
  }: {
    onChoose: () => void;
    onBackToProjects: () => void;
  }) =>
    createElement(
      "div",
      null,
      createElement("button", { onClick: onChoose }, "Choose folder"),
      createElement(
        "button",
        { onClick: onBackToProjects },
        "Choose another project",
      ),
    ),
}));
vi.mock("@/features/drafts/hooks/use-copy-draft", () => ({
  useCopyDraft: () => ({ mutateAsync: mocks.copy, isPending: false }),
}));
vi.mock("@/features/drafts/hooks/use-delete-draft", () => ({
  useDeleteDraft: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));
vi.mock("@/features/drafts/hooks/use-draft", () => ({
  useDraft: () => ({
    data: { id, filename: "snippet.ts", content: "let x = 1" },
    isError: false,
  }),
}));
vi.mock("@/hooks/use-success-feedback", () => ({
  useSuccessFeedback: () => mocks.success,
}));
vi.mock("@/lib/utils", () => ({ alert: mocks.alert, isValidIds: () => true }));

import CopyDraftToProjectScreen from "@/app/draft/copy-to-project";

let root: Root;
let container: HTMLDivElement;
const click = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label),
  );
  expect(button, label).toBeDefined();
  await act(async () => {
    button!.click();
  });
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(CopyDraftToProjectScreen)));
});
afterEach(() => act(() => root.unmount()));

it("closes the copy sheet from its own header", async () => {
  const close = container.querySelector<HTMLButtonElement>(
    '[aria-label="Close copy to project"]',
  );
  expect(close).not.toBeNull();
  await act(async () => close!.click());
  expect(mocks.back).toHaveBeenCalledOnce();
});

it("chooses a project and filename, offers conflict resolution, then keeps the draft", async () => {
  mocks.copy
    .mockResolvedValueOnce({
      error: true,
      code: "FILE_EXISTS",
      message: "Exists",
    })
    .mockResolvedValueOnce({
      error: false,
      data: { path: "snippet.ts", replaced: true },
    });
  await click("Choose project");
  await click("Choose folder");
  expect((container.querySelector("input") as HTMLInputElement).value).toBe(
    "snippet.ts",
  );
  await click("Copy into project");
  expect(container.textContent).toContain("That file already exists");
  await click("Replace");
  expect(mocks.copy).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "replace", filename: "snippet.ts" }),
  );
  expect(container.textContent).toContain("Project/snippet.ts replaced");
  await click("Keep draft");
  expect(mocks.back).toHaveBeenCalledOnce();
});

it("deletes the source only after a successful copy", async () => {
  mocks.copy.mockResolvedValueOnce({
    error: false,
    data: { path: "snippet.ts", replaced: false },
  });
  mocks.remove.mockResolvedValueOnce(undefined);
  await click("Choose project");
  await click("Choose folder");
  await click("Copy into project");
  expect(mocks.remove).not.toHaveBeenCalled();
  await click("Delete draft");
  expect(mocks.remove).toHaveBeenCalledWith(id);
  expect(mocks.dismissTo).toHaveBeenCalledWith("/(main)/drafts");
});

it("returns from folder and filename selection without copying", async () => {
  await click("Choose project");
  await click("Choose another project");
  expect(container.textContent).toContain("Choose project");
  await click("Choose project");
  await click("Choose folder");
  await click("Back to folder");
  expect(container.textContent).toContain("Choose another project");
  expect(mocks.copy).not.toHaveBeenCalled();
});
