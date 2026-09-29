// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TerminalViewProps } from "expo-libghostty";
import type { ProjectTerminalSession } from "../actions/terminal-session";

const mocks = vi.hoisted(() => ({
  props: null as null | TerminalViewProps,
  writeText: vi.fn(async (_chunk: string) => {}),
  input: vi.fn(async (_chunk: string) => {}),
  resize: vi.fn(async (_cols: number, _rows: number) => {}),
  listener: null as null | ((chunk: string) => void),
  unsubscribe: vi.fn(),
}));
vi.mock("expo-libghostty", () => ({
  TerminalView: ({ ref, ...props }: TerminalViewProps) => {
    mocks.props = props;
    useImperativeHandle(ref, () => ({
      writeText: mocks.writeText,
      write: async () => {},
      finish: async () => {},
    }));
    return createElement("div", { "data-testid": "ghostty" });
  },
}));
vi.mock("@/hooks/use-theme", () => ({
  useThemeColor: (name: string) =>
    ({
      background: "#ffffff",
      foreground: "#222222",
      primary: "#336644",
      secondary: "#eeeeee",
      "muted-foreground": "#777777",
      "syntax-tag": "#aa3333",
      "syntax-string": "#338844",
      "syntax-number": "#aa7733",
      "syntax-function": "#3366aa",
      "syntax-keyword": "#7733aa",
      "syntax-property": "#338888",
    })[name],
}));

import { TerminalSurface } from "../components/terminal-surface";

let root: Root;
let container: HTMLDivElement;
const session = {
  getRawOutput: () => "\u001b[31mred\u001b[0m\r\n",
  subscribeRawOutput: (listener: (chunk: string) => void) => {
    mocks.listener = listener;
    return mocks.unsubscribe;
  },
  sendInput: mocks.input,
  resize: mocks.resize,
} as unknown as ProjectTerminalSession;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

it("replays raw PTY output and forwards native input and grid size", async () => {
  await act(async () => {
    root.render(createElement(TerminalSurface, { session, fontSize: 16 }));
  });
  expect(container.querySelector('[data-testid="ghostty"]')).not.toBeNull();
  expect(mocks.writeText).toHaveBeenCalledWith("\u001b[31mred\u001b[0m\r\n");
  await act(async () => mocks.listener?.("next\r\n"));
  expect(mocks.writeText).toHaveBeenLastCalledWith("next\r\n");

  await act(async () => {
    mocks.props?.onInput?.({ nativeEvent: { data: "bHMK", text: "ls\n" } });
    mocks.props?.onResize?.({ nativeEvent: { cols: 80, rows: 24 } });
  });
  expect(mocks.input).toHaveBeenCalledWith("ls\n");
  expect(mocks.resize).toHaveBeenCalledWith(80, 24);
  expect(mocks.props?.fontSize).toBe(16);
  expect(mocks.props?.theme).toMatchObject({
    background: "#ffffff",
    foreground: "#222222",
    cursorColor: "#336644",
    selectionBackground: "#eeeeee",
  });
  expect(mocks.props?.theme?.palette?.slice(0, 3)).toEqual([
    "#777777",
    "#aa3333",
    "#338844",
  ]);
});
