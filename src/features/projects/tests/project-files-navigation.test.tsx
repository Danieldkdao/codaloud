// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FilesScreen from "@/app/projects/[projectId]/files";
import { ProjectFilesList } from "@/features/projects/components/project-files-list";

vi.mock("@/features/projects/components/project-files-search", () => ({ ProjectFilesSearch: () => null }));

vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  FlatList: ({ data, renderItem, ListHeaderComponent }: { data: unknown[]; renderItem: (info: { item: unknown }) => ReactNode; ListHeaderComponent?: ReactNode }) =>
    createElement("div", null, ListHeaderComponent, data.map((item, index) =>
      createElement("div", { key: index }, renderItem({ item })))),
  Pressable: ({ children, onPress, accessibilityLabel }: {
    children: ReactNode; onPress?: () => void; accessibilityLabel?: string;
  }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  expect(container.querySelectorAll("button")[1]?.textContent).toBe("dashboard");
  click("dashboard, folder");
  expect(container.textContent).toBe("..page.tsx");
});

it("keeps file presses inert at the root and inside a folder", () => {
  const initial = container.textContent;
  click("package.json, file");
  expect(container.textContent).toBe(initial);
  click("app, folder");
  const contents = container.textContent;
  click("page.tsx, file");
  expect(container.textContent).toBe(contents);
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
    files: [], parentDirectory: "/workspace/project", onDirectoryPress,
  })));
  expect(container.textContent).toContain("No files created");
  click("Go to parent directory");
  expect(onDirectoryPress).toHaveBeenCalledWith("/workspace/project");
});
