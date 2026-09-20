// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TextPrompt } from "@/components/ui/text-prompt";
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => children,
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => children,
  Platform: { OS: "ios" },
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "theme-color" }));
vi.mock("@/components/ui/content-sheet", () => ({
  ContentSheet: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => createElement("button", { onClick: onPress }, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChangeText,
  }: {
    value: string;
    onChangeText: (text: string) => void;
  }) =>
    createElement("input", {
      value,
      onInput: (event) => onChangeText(event.currentTarget.value),
    }),
}));
it("uses the shared input and submits its edited value exactly once", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rootNode = document.createElement("div");
  const root = createRoot(rootNode);
  const submit = vi.fn();
  try {
    act(() =>
      root.render(
        createElement(TextPrompt, {
          title: "Stash",
          message: "Name",
          placeholder: "Message",
          actionText: "Save",
          defaultValue: "before",
          onSubmit: submit,
          onCancel: vi.fn(),
        }),
      ),
    );
    const input = rootNode.querySelector("input")!;
    act(() => {
      input.value = "after|";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...rootNode.querySelectorAll("button")].find(
      (item) => item.textContent === "Save",
    )!;
    act(() => {
      save.click();
      save.click();
    });
    expect(submit).toHaveBeenCalledExactlyOnceWith("after|");
  } finally {
    act(() => root.unmount());
  }
});
