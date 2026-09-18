// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectWorkspaceCurrentFileProvider, useProjectWorkspaceCurrentFile } from "../hooks/use-project-workspace-current-file";

let files: ReturnType<typeof useProjectWorkspaceCurrentFile>;
let root: Root;
const Probe = () => { files = useProjectWorkspaceCurrentFile(); return null; };
const render = (projectId = "one", children: ReactNode = createElement(Probe)) => act(() => {
  root.render(createElement(ProjectWorkspaceCurrentFileProvider, { projectId, children }));
});
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(document.createElement("div")); render(); });
afterEach(() => { act(() => root.unmount()); });

it("keeps every opened path in order and activates existing tabs without duplicates", () => {
  act(() => { files.openFile("src/a.ts"); files.openFile("b.ts"); files.openFile("src/a.ts"); });
  expect(files.openFilePaths).toEqual(["src/a.ts", "b.ts"]);
  expect(files.activeFilePath).toBe("src/a.ts");
});

it("preserves tabs when a workspace section unmounts and remounts", () => {
  act(() => files.openFile("a.ts"));
  render("one", null);
  render();
  expect(files.openFilePaths).toEqual(["a.ts"]);
  expect(files.activeFilePath).toBe("a.ts");
});

it("closes inactive tabs without moving selection and selects a neighbor for active tabs", () => {
  act(() => { files.openFile("a.ts"); files.openFile("b.ts"); files.openFile("c.ts"); files.openFile("b.ts"); });
  act(() => files.closeFile("a.ts"));
  expect(files.activeFilePath).toBe("b.ts");
  act(() => files.closeFile("b.ts"));
  expect(files.activeFilePath).toBe("c.ts");
  act(() => files.closeFile("c.ts"));
  expect(files.activeFilePath).toBeNull();
  expect(files.openFilePaths).toEqual([]);
});

it("renames every open descendant and removes only the deleted subtree", () => {
  act(() => { files.openFile("src/a.ts"); files.openFile("src/nested/b.ts"); files.openFile("src-other/c.ts"); });
  act(() => files.renameFiles("src", "lib"));
  expect(files.openFilePaths).toEqual(["lib/a.ts", "lib/nested/b.ts", "src-other/c.ts"]);
  expect(files.activeFilePath).toBe("src-other/c.ts");
  act(() => files.removeFiles("lib"));
  expect(files.openFilePaths).toEqual(["src-other/c.ts"]);
});

it("refreshes inactive documents and gives reopened paths a new generation", () => {
  act(() => { files.openFile("a.ts"); files.openFile("b.ts"); });
  const original = files.getFileVersion("a.ts");
  act(() => files.refreshFile("a.ts"));
  expect(files.getFileVersion("a.ts")).toBeGreaterThan(original);
  act(() => files.refreshFiles());
  expect(files.getFileVersion("b.ts")).toBeGreaterThan(0);
  const refreshed = files.getFileVersion("a.ts");
  act(() => { files.closeFile("a.ts"); files.openFile("a.ts"); });
  expect(files.getFileVersion("a.ts")).toBeGreaterThan(refreshed);
});

it("isolates projects and ignores actions captured by a previous project", () => {
  act(() => files.openFile("a.ts"));
  const previous = files;
  render("two");
  act(() => { files.openFile("b.ts"); previous.openFile("late.ts"); previous.renameFiles("a.ts", "old.ts"); });
  expect(files.openFilePaths).toEqual(["b.ts"]);
  expect(files.activeFilePath).toBe("b.ts");
});
