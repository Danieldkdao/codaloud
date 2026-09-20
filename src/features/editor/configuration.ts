import { editorMinimap } from "./minimap";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { insertNewline, indentWithTab } from "@codemirror/commands";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { EditorPreferences } from "@/features/settings/types";

export const editorConfiguration = (preferences: EditorPreferences) => [
  preferences.minimap ? editorMinimap : [],
  preferences.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
  preferences.wordWrap ? EditorView.lineWrapping : [],
  EditorState.tabSize.of(preferences.tabSize),
  indentUnit.of(preferences.useTabs ? "\t" : " ".repeat(preferences.tabSize)),
  preferences.keepIndentation ? indentOnInput() : Prec.highest(keymap.of([{ key: "Enter", run: insertNewline }])),
  preferences.closeBrackets ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [],
  keymap.of([indentWithTab]),
];
