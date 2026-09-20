import { describe, expect, it, vi } from "vitest";
import { createEditorPreferences } from "../editor-preferences";
import { editorThemes } from "../constants";
import { formatEditorAppearance, formatEditorThemeClass } from "@/features/editor/lib/formatters";

const storage = () => ({
  getItem: vi.fn().mockResolvedValue(null),
  setItem: vi.fn().mockResolvedValue(undefined),
});
describe("workspace editor preferences", () => {
  it("loads once for multiple consumers and restores settings across sessions", async () => {
    const disk = storage();
    const state = createEditorPreferences(disk);
    await Promise.all([state.load(), state.load()]);
    expect(disk.getItem).toHaveBeenCalledTimes(1);
    await state.update({ fontSize: 22, wordWrap: true, theme: "Dracula" });
    disk.getItem.mockResolvedValue(disk.setItem.mock.calls.at(-1)![1]);
    const restored = createEditorPreferences(disk);
    await restored.load();
    expect(restored.getSnapshot().preferences).toMatchObject({
      fontSize: 22,
      wordWrap: true,
      theme: "Dracula",
    });
  });
  it("merges a change made during hydration without losing stored fields", async () => {
    const disk = storage();
    let resolve!: (value: string) => void;
    disk.getItem.mockReturnValue(
      new Promise<string>((done) => {
        resolve = done;
      }),
    );
    const state = createEditorPreferences(disk);
    const pending = state.update({ fontSize: 20 });
    resolve(JSON.stringify({ theme: "One Dark", fontSize: 12 }));
    await pending;
    expect(state.getSnapshot().preferences).toMatchObject({
      theme: "One Dark",
      fontSize: 20,
    });
  });
  it("orders rapid writes, preserves changes after failures, and supports retry", async () => {
    const disk = storage();
    const state = createEditorPreferences(disk);
    await state.load();
    disk.setItem.mockRejectedValueOnce(new Error("full"));
    await state.update({ tabSize: 4 });
    expect(state.getSnapshot().error).toBeTruthy();
    await Promise.all([
      state.update({ useTabs: true }),
      state.update({ fontSize: 24 }),
    ]);
    expect(state.getSnapshot().error).toBeNull();
    expect(JSON.parse(disk.setItem.mock.calls.at(-1)![1])).toMatchObject({
      tabSize: 4,
      useTabs: true,
      fontSize: 24,
    });
  });
  it.each([
    "invalid",
    "null",
    '{"fontSize":999,"tabSize":0,"theme":"missing","lineNumbers":"no"}',
  ])("recovers corrupt fields: %s", async (value) => {
    const disk = storage();
    disk.getItem.mockResolvedValue(value);
    const state = createEditorPreferences(disk);
    await state.load();
    expect(state.getSnapshot().preferences).toMatchObject({
      fontSize: 16,
      tabSize: 2,
      theme: "Codaloud",
      lineNumbers: true,
    });
  });
  it("notifies subscribers and remains editable after read failures", async () => {
    const disk = storage();
    disk.getItem.mockRejectedValue(new Error("offline"));
    const state = createEditorPreferences(disk);
    const listener = vi.fn();
    const unsubscribe = state.subscribe(listener);
    await state.load();
    expect(state.getSnapshot().ready).toBe(true);
    expect(state.getSnapshot().error).toBeTruthy();
    await state.update({ minimap: true });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await state.update({ closeBrackets: false });
    expect(listener).not.toHaveBeenCalled();
  });
});

it.each(editorThemes.filter((theme) => !theme.startsWith("Codaloud")))("restores named theme %s", async (theme) => {
  const disk = storage();
  disk.getItem.mockResolvedValue(JSON.stringify({ theme }));
  const state = createEditorPreferences(disk);
  await state.load();
  expect(state.getSnapshot().preferences.theme).toBe(theme);
});
it("offers one adaptive Codaloud theme alongside four light and four dark themes", () => {
  expect(editorThemes.filter((theme) => theme.startsWith("Codaloud"))).toEqual(["Codaloud"]);
  expect(editorThemes.filter((theme) => formatEditorAppearance(theme) === "light")).toHaveLength(4);
  expect(editorThemes.filter((theme) => formatEditorAppearance(theme) === "dark")).toHaveLength(4);
  expect(formatEditorAppearance("Codaloud")).toBeNull();
  expect(formatEditorThemeClass("Codaloud")).toBe("");
});
it.each(["Codaloud White", "Codaloud Dark"])("restores retired %s as adaptive Codaloud without losing other preferences", async (theme) => {
  const disk = storage();
  disk.getItem.mockResolvedValue(JSON.stringify({ theme, fontSize: 20, font: "Fira Code", minimap: true }));
  const state = createEditorPreferences(disk);
  await state.load();
  expect(state.getSnapshot().preferences).toMatchObject({ theme: "Codaloud", fontSize: 20, font: "Fira Code", minimap: true });
  await state.update({ tabSize: 4 });
  expect(JSON.parse(disk.setItem.mock.calls.at(-1)![1])).toMatchObject({ theme: "Codaloud", fontSize: 20, font: "Fira Code", minimap: true, tabSize: 4 });
});
