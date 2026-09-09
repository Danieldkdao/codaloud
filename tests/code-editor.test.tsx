// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "codemirror";
import { undo } from "@codemirror/commands";
import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { openSearchPanel } from "@codemirror/search";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CodeEditor from "@/components/code-editor";

const fontState = vi.hoisted(() => ({ loaded: true, error: null as Error | null }));
vi.mock("expo-font", () => ({ useFonts: () => [fontState.loaded, fontState.error] }));
vi.mock("@expo-google-fonts/jetbrains-mono/400Regular", () => ({ JetBrainsMono_400Regular: 1 }));
vi.mock("@expo-google-fonts/outfit/400Regular", () => ({ Outfit_400Regular: 2 }));

let container: HTMLDivElement;
let root: Root;
const render = (filename = "demo.ts", bottomInset = 0, onReady?: () => Promise<void>) => act(() => {
  root.render(createElement(CodeEditor, { filename, initialValue: "const answer = 42;", bottomInset, onReady }));
});
const editor = () => EditorView.findFromDOM(container.querySelector(".cm-editor")!)!;

beforeEach(() => {
  fontState.loaded = true;
  fontState.error = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("keeps edits and undo history when the available space changes", async () => {
  await render();
  const view = editor();
  act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: "\n// edited" } }));
  await render("demo.ts", 180);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toContain("// edited");
  act(() => { undo(view); });
  expect(view.state.doc.toString()).toBe("const answer = 42;");
});

it("creates a fresh document when the file identity changes", async () => {
  await render();
  const previous = editor();
  act(() => previous.dispatch({ changes: { from: 0, insert: "// old file\n" } }));
  await render("other.unknown");
  expect(editor()).not.toBe(previous);
  expect(editor().state.doc.toString()).toBe("const answer = 42;");
  expect(editor().contentDOM.getAttribute("aria-label")).toBe("other.unknown code editor");
});

it("keeps search available to editor commands without a web toolbar", async () => {
  await render();
  expect(container.querySelector("header")).toBeNull();
  expect(container.querySelector("details")).toBeNull();
  act(() => { openSearchPanel(editor()); });
  expect(container.querySelector('input[name="search"]')).not.toBeNull();
});


it("reports readiness after fonts and language setup, without resetting edits on callback changes", async () => {
  fontState.loaded = false;
  const onReady = vi.fn().mockResolvedValue(undefined);
  let finishLanguage!: (value: LanguageSupport) => void;
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () => new Promise((resolve) => { finishLanguage = resolve; }),
  } as unknown as LanguageDescription);
  await render("demo.ts", 0, onReady);
  const view = editor();
  expect(onReady).not.toHaveBeenCalled();
  fontState.loaded = true;
  await render("demo.ts", 0, onReady);
  expect(onReady).not.toHaveBeenCalled();
  await act(async () => { finishLanguage({ extension: [] } as unknown as LanguageSupport); });
  await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  act(() => view.dispatch({ changes: { from: 0, insert: "// keep edits\n" } }));
  const replacementCallback = vi.fn().mockResolvedValue(undefined);
  await render("demo.ts", 180, replacementCallback);
  expect(editor()).toBe(view);
  expect(view.state.doc.toString()).toContain("// keep edits");
  expect(replacementCallback).not.toHaveBeenCalled();
});

it("still becomes ready with fallback fonts and unavailable highlighting", async () => {
  fontState.loaded = false;
  fontState.error = new Error("Font unavailable");
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () => Promise.reject(new Error("Language unavailable")),
  } as unknown as LanguageDescription);
  const onReady = vi.fn().mockResolvedValue(undefined);
  await render("demo.ts", 0, onReady);
  await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  expect(container.textContent).toContain("Highlighting unavailable");
});

it("does not report readiness for an editor removed during initialization", async () => {
  let finishLanguage!: (value: LanguageSupport) => void;
  vi.spyOn(LanguageDescription, "matchFilename").mockReturnValue({
    load: () => new Promise((resolve) => { finishLanguage = resolve; }),
  } as unknown as LanguageDescription);
  const onReady = vi.fn().mockResolvedValue(undefined);
  await render("demo.ts", 0, onReady);
  await act(async () => { root.render(null); });
  await act(async () => { finishLanguage({ extension: [] } as unknown as LanguageSupport); });
  expect(onReady).not.toHaveBeenCalled();
});
