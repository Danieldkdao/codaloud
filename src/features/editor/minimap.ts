import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export const editorMinimap = [EditorView.theme({ "&": { paddingRight: "48px" } }), ViewPlugin.fromClass(class {
  dom = document.createElement("div");
  svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  slider = document.createElement("input");
  viewport = document.createElement("div");
  constructor(readonly view: EditorView) {
    this.dom.className = "cm-minimap";
    this.viewport.className = "cm-minimap-viewport";
    this.svg.setAttribute("viewBox", "0 0 100 600");
    this.svg.setAttribute("preserveAspectRatio", "none");
    this.svg.setAttribute("aria-hidden", "true");
    this.slider.type = "range";
    this.slider.min = "0"; this.slider.max = "100"; this.slider.step = "0.1";
    this.slider.setAttribute("aria-label", "File minimap position");
    this.slider.setAttribute("aria-orientation", "vertical");
    this.slider.addEventListener("input", this.navigate);
    this.dom.append(this.svg, this.viewport, this.slider);
    view.dom.append(this.dom);
    this.draw(); this.position();
  }
  navigate = () => {
    const line = Math.max(1, Math.min(this.view.state.doc.lines, Math.round(Number(this.slider.value) / 100 * (this.view.state.doc.lines - 1)) + 1));
    const position = this.view.state.doc.line(line).from;
    this.view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: "center" }) });
  };
  draw = () => {
    const doc = this.view.state.doc;
    const count = Math.min(600, doc.lines);
    const nodes = [];
    for (let row = 0; row < count; row++) {
      const line = doc.line(Math.floor(row * doc.lines / count) + 1).text;
      const indent = Math.min(80, line.length - line.trimStart().length);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(indent)); rect.setAttribute("y", String(row * 600 / count));
      rect.setAttribute("width", String(Math.min(100 - indent, line.trim().length)));
      rect.setAttribute("height", String(Math.max(0.5, Math.min(3, 480 / count))));
      nodes.push(rect);
    }
    this.svg.replaceChildren(...nodes);
  };
  position = () => {
    const doc = this.view.state.doc;
    const first = doc.lineAt(this.view.viewport.from).number - 1;
    const last = doc.lineAt(this.view.viewport.to).number;
    this.viewport.style.top = `${first / doc.lines * 100}%`;
    this.viewport.style.height = `${Math.max(1, (last - first) / doc.lines * 100)}%`;
    this.slider.value = String(first / Math.max(1, doc.lines - 1) * 100);
  };
  update(update: ViewUpdate) {
    if (update.docChanged) this.draw();
    if (update.docChanged || update.viewportChanged) this.position();
  }
  destroy() { this.slider.removeEventListener("input", this.navigate); this.dom.remove(); }
})];
