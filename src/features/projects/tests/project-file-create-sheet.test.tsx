// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProjectFileCreateSheet } from "../components/project-file-create-sheet";
const mocks = vi.hoisted(() => ({ submit: vi.fn(), swipe: undefined as undefined | ((event: unknown, gesture: { dy: number }) => void) }));
vi.mock("react-native", () => ({
  Modal: ({ children }: { children: ReactNode }) => children,
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => children,
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress: () => void; accessibilityLabel: string }) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
  PanResponder: { create: (handlers: { onPanResponderRelease: typeof mocks.swipe }) => { mocks.swipe = handlers.onPanResponderRelease; return { panHandlers: {} }; } },
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => children }));
vi.mock("../components/project-file-name-row", () => ({ ProjectFileNameRow: ({ ref, submitOnBlur, onCancel }: { ref: Ref<unknown>; submitOnBlur: boolean; onCancel: () => void }) => {
  useImperativeHandle(ref, () => ({ submit: mocks.submit, cancel: onCancel }));
  return createElement("div", { "data-blur-submit": String(submitOnBlur) });
} }));
it("uses the backdrop to submit but swiping to cancel, without blur submission", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const cancel = vi.fn();
  try {
    await act(async () => root.render(createElement(ProjectFileCreateSheet, { kind: "file", existingNames: [], parentPath: "", onCreate: vi.fn(), onCancel: cancel })));
    expect(container.querySelector('[data-blur-submit="false"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Finish creating file or folder"]')!.click());
    expect(mocks.submit).toHaveBeenCalledOnce();
    act(() => mocks.swipe?.({}, { dy: 100 }));
    expect(cancel).toHaveBeenCalledOnce();
  } finally { act(() => root.unmount()); }
});
