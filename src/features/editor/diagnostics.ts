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

class InlineDiagnostic extends WidgetType {
  constructor(
    readonly message: string,
    readonly severity: Diagnostic["severity"],
  ) {
    super();
  }
  eq(other: InlineDiagnostic) {
    return this.message === other.message && this.severity === other.severity;
  }
  toDOM() {
    const element = document.createElement("span");
    element.className = formatInlineDiagnosticClass(this.severity);
    element.textContent = ` ${this.message}`;
    element.setAttribute("aria-label", `${this.severity}: ${this.message}`);
    element.setAttribute("role", "note");
    return element;
  }
  ignoreEvent() {
    return true;
  }
}
const decorate = (view: EditorView) => {
  const ranges: ReturnType<Decoration["range"]>[] = [];
  const lines = new Map<number, Diagnostic["severity"]>();
  forEachDiagnostic(view.state, (diagnostic, from) => {
    if (
      !view.visibleRanges.some(
        (range) => from >= range.from && from <= range.to,
      )
    )
      return;
    const line = view.state.doc.lineAt(from);
    ranges.push(
      Decoration.widget({
        widget: new InlineDiagnostic(diagnostic.message, diagnostic.severity),
        side: 1,
      }).range(line.to),
    );
    const previous = lines.get(line.from);
    if (
      !previous ||
      diagnostic.severity === "error" ||
      (diagnostic.severity === "warning" && previous !== "error")
    )
      lines.set(line.from, diagnostic.severity);
  });
  for (const [from, severity] of lines)
    ranges.push(
      Decoration.line({ class: formatDiagnosticLineClass(severity) }).range(
        from,
      ),
    );
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
