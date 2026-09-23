// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useVoiceEditor } from "../hooks/use-voice-editor";
import { inlineSession } from "../inline-session";
import type { CodeEditorRef } from "@/components/code-editor";

const mocks = vi.hoisted(() => ({ branch: vi.fn() }));
vi.mock("@/features/projects/actions/git-actions", () => ({
  readProjectGitCountsAction: mocks.branch,
}));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  roots.forEach((root) => act(() => root.unmount()));
  roots.length = 0;
  inlineSession.cancel();
  vi.unstubAllGlobals();
});
const mount = async (blocked = false) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.branch.mockReset().mockResolvedValue({ currentBranch: "main" });
  let locked = false;
  const apply = vi.fn();
  const runWorkspaceOperation = vi.fn(
    async <T,>(
      _label: string,
      action: (assertCurrent: () => void) => Promise<T>,
    ) => {
      if (blocked) throw new Error("Workspace busy.");
      locked = true;
      try {
        return await action(() => {});
      } finally {
        locked = false;
      }
    },
  );
  const Test = () => {
    const editor = {
      current: {
        captureContext: (id: string) =>
          void bridge.onContext(id, {
            documentKey: "doc",
            revision: 1,
            content: "abc",
            from: 0,
            to: 1,
            focused: true,
          }),
        previewSuggestion: () => {},
        acceptSuggestion: (id: string) => {
          expect(locked).toBe(true);
          apply();
          void bridge.onSuggestionApplied(id, true);
        },
      } as unknown as CodeEditorRef,
    };
    const bridge = useVoiceEditor({
      projectId: "p",
      branch: "history-only",
      busy: false,
      activePath: "a.ts",
      documentKey: "doc",
      editor,
      getOpenFiles: () => [],
      runWorkspaceOperation: runWorkspaceOperation as Parameters<
        typeof useVoiceEditor
      >[0]["runWorkspaceOperation"],
    });
    return null;
  };
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => root.render(<Test />));
  const request = await inlineSession.begin("p");
  inlineSession.receive({ id: request.id, type: "start" });
  inlineSession.receive({
    id: request.id,
    type: "delta",
    offset: 0,
    text: "x",
  });
  inlineSession.receive({ id: request.id, type: "complete" });
  return { request, apply, runWorkspaceOperation };
};
it("captures the actual checkout and applies under the workspace operation lock", async () => {
  const { request, apply, runWorkspaceOperation } = await mount();
  expect(request.context?.branch).toBe("main");
  await inlineSession.accept(request.id);
  expect(apply).toHaveBeenCalledOnce();
  expect(runWorkspaceOperation).toHaveBeenCalledOnce();
  expect(inlineSession.getSnapshot()?.status).toBe("accepted");
});
it("cannot accept while another workspace operation owns the lock", async () => {
  const { request, apply } = await mount(true);
  await inlineSession.accept(request.id);
  expect(apply).not.toHaveBeenCalled();
  expect(inlineSession.getSnapshot()?.status).toBe("error");
});
it("rechecks the checkout inside the lock before sending an editor mutation", async () => {
  const { request, apply } = await mount();
  mocks.branch
    .mockResolvedValueOnce({ currentBranch: "main" })
    .mockResolvedValueOnce({ currentBranch: "changed" });
  await inlineSession.accept(request.id);
  expect(apply).not.toHaveBeenCalled();
  expect(inlineSession.getSnapshot()?.status).toBe("error");
});
