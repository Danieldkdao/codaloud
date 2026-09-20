// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EditorControlsProvider, useEditorControls } from "../use-editor-controls";
it("shares active editor commands with the workspace dock and clears them on unmount", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let controls!: NonNullable<ReturnType<typeof useEditorControls>>;
  const Probe = () => { controls = useEditorControls()!; return null; };
  const root = createRoot(document.createElement("div"));
  try {
    act(() => root.render(createElement(EditorControlsProvider, null, createElement(Probe))));
    expect(controls.state).toBeNull();
    const run = vi.fn();
    act(() => controls.setState({ canUndo: true, canRedo: false, run }));
    controls.state!.run("undo"); expect(run).toHaveBeenCalledWith("undo");
    act(() => controls.setState(null)); expect(controls.state).toBeNull();
  } finally { act(() => root.unmount()); }
});
