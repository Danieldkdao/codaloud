// @vitest-environment happy-dom
import {
  act,
  createElement,
  useImperativeHandle,
  useState,
  type Ref,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TextInputProps } from "react-native";
import { Input } from "@/components/ui/input";
import { KeyboardSymbolsContext } from "@/hooks/use-keyboard-symbols";

let input: TextInputProps;
const native = vi.hoisted(() => ({ focused: true, setNativeProps: vi.fn() }));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => children,
  TextInput: ({ ref, ...props }: TextInputProps & { ref: Ref<unknown> }) => {
    input = props;
    useImperativeHandle(ref, () => ({
      isFocused: () => native.focused,
      setNativeProps: native.setNativeProps,
    }));
    return createElement("input", { value: props.value, readOnly: true });
  },
}));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/lib/utils", () => ({
  cn: (...items: unknown[]) => items.filter(Boolean).join(" "),
}));
let target: { id: string; insert: (text: string) => void } | null;
const host = {
  activate: (next: NonNullable<typeof target>) => {
    target = next;
  },
  deactivate: (id: string) => {
    if (target?.id === id) target = null;
  },
};
let root: Root;
let container: HTMLDivElement;
const render = (props: TextInputProps = {}) =>
  act(() =>
    root.render(
      createElement(
        KeyboardSymbolsContext,
        { value: host },
        createElement(Input, props),
      ),
    ),
  );
const focus = () => act(() => input.onFocus?.({ nativeEvent: {} } as never));
const select = (start: number, end = start) =>
  act(() =>
    input.onSelectionChange?.({
      nativeEvent: { selection: { start, end } },
    } as never),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  target = null;
  native.focused = true;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it("inserts at the cursor, replaces selections, and preserves rapid consecutive taps", () => {
  const changed = vi.fn();
  render({ defaultValue: "abc", onChangeText: changed });
  focus();
  select(1, 2);
  act(() => {
    target!.insert("|");
    target!.insert("\\");
  });
  expect(changed.mock.calls.map(([text]) => text)).toEqual(["a|c", "a|\\c"]);
  expect(container.querySelector("input")?.value).toBe("a|\\c");
});
it("updates controlled multiline forms and respects maxLength when replacing", () => {
  const Form = () => {
    const [value, setValue] = useState("a\nb");
    return createElement(Input, {
      value,
      onChangeText: setValue,
      multiline: true,
      maxLength: 3,
    });
  };
  act(() =>
    root.render(
      createElement(
        KeyboardSymbolsContext,
        { value: host },
        createElement(Form),
      ),
    ),
  );
  focus();
  select(1, 2);
  act(() => target!.insert("+"));
  expect(input.value).toBe("a+b");
  act(() => target!.insert("-"));
  expect(input.value).toBe("a+b");
});
it("releases the target on blur and unmount, and blocks disabled or stale inputs", () => {
  render({ value: "abc" });
  focus();
  const insert = target!.insert;
  native.focused = false;
  act(() => insert("+"));
  expect(native.setNativeProps).not.toHaveBeenCalled();
  act(() => input.onBlur?.({ nativeEvent: {} } as never));
  expect(target).toBeNull();
  native.focused = true;
  focus();
  render({ value: "abc", readOnly: true });
  act(() => insert("+"));
  expect(native.setNativeProps).not.toHaveBeenCalled();
  expect(target).toBeNull();
});

it("opts ordinary inputs out of correction, spelling and autofill suggestions", () => {
  render({ multiline: true });
  expect(input.autoCorrect).toBe(false);
  expect(input.spellCheck).toBe(false);
  expect(input.autoComplete).toBe("off");
});

it("preserves explicit keyboard preferences and semantic autofill hints", () => {
  render({ autoCorrect: true, spellCheck: true, autoComplete: "email" });
  expect(input.autoCorrect).toBe(true);
  expect(input.spellCheck).toBe(true);
  expect(input.autoComplete).toBe("email");
  render({ textContentType: "oneTimeCode" });
  expect(input.textContentType).toBe("oneTimeCode");
  expect(input.autoComplete).toBeUndefined();
});
