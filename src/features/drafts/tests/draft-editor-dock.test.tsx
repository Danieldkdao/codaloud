// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { VoiceConversation } from "@/features/voice/hooks/use-voice-conversation";

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  Pressable: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children),
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("@/features/projects/components/project-code-tools", () => ({
  ProjectCodeTools: () => null,
}));
vi.mock("@/features/voice/components/voice-microphone", () => ({
  VoiceMicrophone: () => createElement("button", { "data-microphone": true }),
}));
vi.mock("@/lib/utils", () => ({ cn: () => "" }));
import { DraftEditorDock } from "../components/draft-editor-dock";

it("retains one dock microphone as the bubble opens and closes", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    for (const visible of [false, true, false, true]) {
      const conversation = { visible } as VoiceConversation;
      act(() =>
        root.render(
          <DraftEditorDock
            conversation={conversation}
            onCopyToProject={() => {}}
          />,
        ),
      );
      expect(container.querySelectorAll("[data-microphone]")).toHaveLength(1);
      expect(container.querySelectorAll("button")).toHaveLength(2);
    }
  } finally {
    act(() => root.unmount());
  }
});
