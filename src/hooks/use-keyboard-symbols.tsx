import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { TextInput, TextInputProps } from "react-native";

type KeyboardSymbolTarget = { id: string; insert: (symbol: string) => void };
export const KeyboardSymbolsInsetContext = createContext(0);
export const useKeyboardSymbolsInset = () => use(KeyboardSymbolsInsetContext);
export const KeyboardSymbolsContext = createContext<{
  activate: (target: KeyboardSymbolTarget) => void;
  deactivate: (id: string) => void;
} | null>(null);

/** Owns cursor-aware insertion for both controlled forms and uncontrolled inputs. */
export const useKeyboardSymbols = (
  ref: RefObject<TextInput | null>,
  props: TextInputProps,
  editable: boolean,
) => {
  const host = use(KeyboardSymbolsContext);
  const id = useId();
  const [draft, setDraft] = useState(props.defaultValue ?? "");
  const value = props.value ?? draft;
  const text = useRef(value);
  const lastValue = useRef(value);
  if (value !== lastValue.current) text.current = value;
  lastValue.current = value;
  const selection = useRef(
    props.selection ?? { start: value.length, end: value.length },
  );
  const latest = useRef({ props, editable });
  latest.current = { props, editable };
  useEffect(() => {
    if (!editable) host?.deactivate(id);
    return () => host?.deactivate(id);
  }, [host, id, editable]);

  const change = (next: string) => {
    text.current = next;
    setDraft(next);
    latest.current.props.onChangeText?.(next);
  };
  const insert = (symbol: string) => {
    const current = latest.current;
    if (!current.editable || !ref.current?.isFocused()) return;
    const range = current.props.selection ?? selection.current;
    const start = Math.max(
      0,
      Math.min(range.start, range.end ?? range.start, text.current.length),
    );
    const end = Math.max(
      start,
      Math.min(
        Math.max(range.start, range.end ?? range.start),
        text.current.length,
      ),
    );
    const next =
      text.current.slice(0, start) + symbol + text.current.slice(end);
    if (
      current.props.maxLength !== undefined &&
      next.length > current.props.maxLength
    )
      return;
    selection.current = {
      start: start + symbol.length,
      end: start + symbol.length,
    };
    // Move the native cursor with the text; do not leave a controlled selection
    // prop behind that would pin the cursor when the user resumes typing.
    ref.current.setNativeProps({ text: next, selection: selection.current });
    change(next);
  };
  return {
    value,
    onChangeText: change,
    onSelectionChange: ((event) => {
      selection.current = event.nativeEvent.selection;
      props.onSelectionChange?.(event);
    }) satisfies NonNullable<TextInputProps["onSelectionChange"]>,
    onFocus: ((event) => {
      if (editable) host?.activate({ id, insert });
      props.onFocus?.(event);
    }) satisfies NonNullable<TextInputProps["onFocus"]>,
    onBlur: ((event) => {
      host?.deactivate(id);
      props.onBlur?.(event);
    }) satisfies NonNullable<TextInputProps["onBlur"]>,
  };
};
