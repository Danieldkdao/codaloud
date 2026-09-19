// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectWorkspacePlaceholder } from "@/features/projects/components/project-workspace-placeholder";

const layout = vi.hoisted(() => ({ width: 390, height: 844, top: 103, contentHeight: 741, dockHeight: 118 }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: layout.width, height: layout.height }),
  View: ({ children, ref }: { children?: ReactNode; ref?: Ref<unknown> }) => {
    useImperativeHandle(ref, () => ({
      measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
        callback(0, layout.top, layout.width, layout.contentHeight),
    }));
    return createElement("div", null, children);
  },
}));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children, style, contentContainerStyle }: { children?: ReactNode; style?: object; contentContainerStyle?: object }) =>
    createElement("div", { "data-scroll-style": JSON.stringify(style), "data-content-style": JSON.stringify(contentContainerStyle) }, children),
}));
vi.mock("@/components/ui/text", () => ({
  HeadingText: ({ children }: { children?: ReactNode }) => createElement("h1", null, children),
  PText: ({ children }: { children?: ReactNode }) => createElement("p", null, children),
}));
vi.mock("@/features/projects/hooks/use-project-workspace-dock-height", () => ({
  useProjectWorkspaceDockHeight: () => ({ dockHeight: layout.dockHeight }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(layout, { width: 390, height: 844, top: 103, contentHeight: 741, dockHeight: 118 });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

const renderCentered = () => act(() => root.render(
  createElement(ProjectWorkspacePlaceholder, {
    title: "No file selected",
    centerInWindow: true,
    action: createElement("button", null, "Open file"),
  }),
));
const expectWindowCenter = () => {
  const scroll = container.querySelector("[data-content-style]")!;
  const padding = JSON.parse(scroll.getAttribute("data-content-style")!);
  const center = layout.top + (layout.contentHeight + padding.paddingTop - padding.paddingBottom) / 2;
  expect(center).toBe(layout.height / 2);
  expect(JSON.parse(scroll.getAttribute("data-scroll-style") ?? "{}").marginBottom ?? 0).toBe(0);
};

it("centers against the window despite the native header and changing dock height", () => {
  renderCentered();
  expectWindowCenter();
  layout.dockHeight = 90;
  renderCentered();
  expectWindowCenter();
  expect(container.querySelector("button")?.textContent).toBe("Open file");
});

it("remeasures when rotating and accounts for space below the content", () => {
  renderCentered();
  Object.assign(layout, { width: 844, height: 390, top: 44, contentHeight: 325 });
  renderCentered();
  expectWindowCenter();
});

it("keeps other workspace placeholders centered above their dock", () => {
  act(() => root.render(createElement(ProjectWorkspacePlaceholder, { title: "No activity yet" })));
  const scroll = container.querySelector("[data-scroll-style]")!;
  expect(JSON.parse(scroll.getAttribute("data-scroll-style")!).marginBottom).toBe(layout.dockHeight);
});
