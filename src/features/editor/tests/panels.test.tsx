// @vitest-environment happy-dom
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorSearchBar } from "../components/editor-search-bar";
import { EditorProblemsSheet } from "../components/editor-problems-sheet";
import type { EditorSearchQuery } from "../types";
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel, disabled }: { children?: ReactNode; onPress?: () => void; accessibilityLabel?: string; disabled?: boolean }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled }, children),
  FlatList: ({ data, renderItem, ListEmptyComponent }: { data: unknown[]; renderItem: (args: {item: unknown}) => ReactNode; ListEmptyComponent: ReactNode }) => createElement("div", null, data.length ? data.map((item, index) => createElement("div", { key: index }, renderItem({ item }))) : ListEmptyComponent),
  useWindowDimensions: () => ({ height: 844, width: 390 }),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "background" }));
vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children?: ReactNode }) => createElement("span", null, children) }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/input", () => ({ Input: ({ value, onChangeText, accessibilityLabel }: { value: string; onChangeText: (value: string) => void; accessibilityLabel: string }) => createElement("input", { value, "aria-label": accessibilityLabel, onInput: (event) => onChangeText(event.currentTarget.value) }) }));
vi.mock("@/components/ui/content-sheet", () => ({ ContentSheet: ({ children, open }: { children?: ReactNode; open: boolean }) => open ? children : null }));
let root: Root; let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });
const click = (label: string) => act(() => { const button = [...container.querySelectorAll("button")].find((item) => (item.getAttribute("aria-label") ?? item.textContent) === label); expect(button).toBeDefined(); button!.click(); });
it("toggles replacement and search options without dropping either input", () => {
  const command = vi.fn(); let query!: EditorSearchQuery;
  const Probe = () => { const [value, setValue] = useState<EditorSearchQuery>({ search: "old", replace: "new" }); const [replace, setReplace] = useState(false); query = value; return createElement(EditorSearchBar, { query: value, onChange: setValue, replace, onReplaceChange: setReplace, onCommand: command, onClose: vi.fn(), summary: { total: 2, active: 1, error: null } }); };
  act(() => root.render(createElement(Probe)));
  click("Toggle replace"); expect(container.querySelector<HTMLInputElement>('[aria-label="Replace with"]')?.value).toBe("new");
  click("Match case"); click("Match whole words"); click("Use regular expression");
  expect(query).toMatchObject({ caseSensitive: true, wholeWord: true, regexp: true, search: "old", replace: "new" });
  click("Replace all matches"); expect(command).toHaveBeenCalledWith("replace-all");
  click("Toggle replace"); expect(container.querySelector('[aria-label="Replace with"]')).toBeNull();
});
it("disables destructive search actions for invalid patterns or no matches", () => {
  const command = vi.fn();
  act(() => root.render(createElement(EditorSearchBar, { query: { search: "[" }, summary: { total: 0, active: 0, error: "Invalid regular expression" }, replace: true, onReplaceChange: vi.fn(), onChange: vi.fn(), onCommand: command, onClose: vi.fn() })));
  click("Replace all matches"); expect(command).not.toHaveBeenCalled(); expect(container.textContent).toContain("Invalid regular expression");
});
it("debounces problem search, combines severity filters, and selects the exact diagnostic", async () => {
  vi.useFakeTimers(); const select = vi.fn();
  const diagnostics = [{ from: 0, to: 1, code: 1, severity: "error" as const, message: "Invalid assignment", line: 1, column: 1 }, { from: 2, to: 3, code: 2, severity: "warning" as const, message: "Unused name", line: 2, column: 1 }];
  act(() => root.render(createElement(EditorProblemsSheet, { open: true, onOpenChange: vi.fn(), analysis: { status: "ready", diagnostics }, onSelect: select })));
  const input = container.querySelector("input")!;
  act(() => { input.value = "unused"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.textContent).toContain("Invalid assignment");
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  expect(container.textContent).not.toContain("Invalid assignment");
  click("Errors"); expect(container.textContent).toContain("No matching problems");
  click("Warnings"); click("warning: Unused name, Line 2, column 1 · TS2");
  expect(select).toHaveBeenCalledWith(diagnostics[1]);
});
