import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { forEachDiagnostic, type Diagnostic } from "@codemirror/lint";
import {
  formatInlineDiagnosticClass,
  formatDiagnosticLineClass,
} from "./lib/formatters";

// The severity a line is reported under is the worst one on it, not whichever
// diagnostic happened to be visited first. CodeMirror yields diagnostics in
// document order, which for a single line is by offset, not by severity.
const worseSeverity = (
  current: Diagnostic["severity"],
  candidate: Diagnostic["severity"],
): Diagnostic["severity"] => {
  if (current === "error") return current;
  if (candidate === "error") return candidate;
  if (current === "warning") return current;
  return candidate;
};

class InlineDiagnostic extends WidgetType {
  constructor(
    readonly messages: string[],
    readonly severity: Diagnostic["severity"],
  ) {
    super();
  }
  eq(other: InlineDiagnostic) {
    return (
      this.severity === other.severity &&
      this.messages.length === other.messages.length &&
      this.messages.every((message, index) => message === other.messages[index])
    );
  }
  toDOM() {
    const element = document.createElement("span");
    element.className = formatInlineDiagnosticClass(this.severity);
    element.textContent = this.messages.join(" · ");
    element.setAttribute(
      "aria-label",
      `${this.severity}: ${this.messages.join(" · ")}`,
    );
    element.setAttribute("role", "note");
    return element;
  }
  ignoreEvent() {
    return true;
  }
}
type LineDiagnostic = {
  lineFrom: number;
  lineTo: number;
  messages: string[];
  severity: Diagnostic["severity"];
};
const decorate = (view: EditorView) => {
  const ranges: ReturnType<Decoration["range"]>[] = [];
  const byLine = new Map<number, LineDiagnostic>();
  forEachDiagnostic(view.state, (diagnostic, from) => {
    if (
      !view.visibleRanges.some(
        (range) => from >= range.from && from <= range.to,
      )
    )
      return;
    const line = view.state.doc.lineAt(from);
    const entry = byLine.get(line.from) ?? {
      lineFrom: line.from,
      lineTo: line.to,
      messages: [],
      severity: diagnostic.severity,
    };
    entry.messages.push(diagnostic.message);
    entry.severity = worseSeverity(entry.severity, diagnostic.severity);
    byLine.set(line.from, entry);
  });
  for (const entry of byLine.values()) {
    // One hint per line rather than one per diagnostic. Several widgets at the
    // same position each get their own inline box, so a second message starts
    // where the first ended and runs off the right edge of a narrow editor,
    // which hid ShellCheck's paired parse errors past the viewport.
    ranges.push(
      Decoration.widget({
        widget: new InlineDiagnostic(entry.messages, entry.severity),
        side: 1,
      }).range(entry.lineTo),
    );
    ranges.push(
      Decoration.line({
        class: formatDiagnosticLineClass(entry.severity),
      }).range(entry.lineFrom),
    );
  }
  return Decoration.set(ranges, true);
};
export const inlineDiagnostics = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((transaction) => transaction.effects.length)
      )
        this.decorations = decorate(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
