// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { createInlineSession } from "../inline-session";
import { getVoiceContext } from "../voice-workspace";
import { generateInlineVoiceEdit } from "@/services/ai/inline-voice-tools";
import {
  inlineSuggestion,
  updateInlineSuggestion,
  acceptInlineSuggestion,
} from "@/features/editor/inline-suggestion";
const mocks = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  streamText: mocks.stream,
}));
vi.mock("@/services/ai/server", () => ({
  openrouter: { chat: () => "model" },
}));
vi.mock("@/features/agent/tools/workspace-tools", () => ({
  workspaceTools: {},
}));
vi.mock("@/features/agent/lib/file-diagnostics", () => ({
  collectFileDiagnostics: vi.fn(),
}));
const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
it.each([true, false])(
  "streams an exact correction at a caret and reviews it through real buttons: accept=%s",
  async (accept) => {
    const source = "const n = Math.floor(Math.random * 10);";
    const session = createInlineSession();
    const saved: string[] = [];
    let revision = 1;
    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [
          history(),
          inlineSuggestion,
          EditorView.domEventHandlers({
            "codaloud-suggestion": (event) => {
              const { id, action } = (event as CustomEvent).detail;
              if (action === "accept") void session.accept(id);
              else session.cancel();
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              revision++;
              saved.push(update.state.doc.toString());
            }
            session.invalidate(
              "doc",
              revision,
              update.state.field(inlineSuggestion)?.id,
            );
          }),
        ],
      }),
    });
    views.push(view);
    session.register("p", {
      capture: async () => ({
        projectId: "p",
        branch: "main",
        openFiles: [],
        activeFile: {
          path: "a.ts",
          documentKey: "doc",
          revision,
          content: view.state.doc.toString(),
          from: source.length,
          to: source.length,
          focused: true,
        },
      }),
      preview: (value) => updateInlineSuggestion(view, value),
      apply: async (value) => acceptInlineSuggestion(view, value.id),
    });
    mocks.stream.mockReturnValue({
      partialOutputStream: (async function* () {
        yield { oldText: "Math.random", newText: "Math." };
        expect(view.state.doc.toString()).toBe(
          "const n = Math.floor(Math. * 10);",
        );
        yield { oldText: "Math.random", newText: "Math.random()" };
      })(),
      finishReason: Promise.resolve("stop"),
      output: Promise.resolve({
        oldText: "Math.random",
        newText: "Math.random()",
      }),
    });
    const request = await session.begin("p", "quick-edit");
    await generateInlineVoiceEdit(
      getVoiceContext(request),
      [],
      "fix the missing parentheses",
      async (_method, payload) => {
        session.receive(payload as Parameters<typeof session.receive>[0]);
        return { ok: true };
      },
      new AbortController().signal,
    );
    const corrected = "const n = Math.floor(Math.random() * 10);";
    expect(view.state.doc.toString()).toBe(corrected);
    view.dom
      .querySelector<HTMLButtonElement>(
        `[aria-label="${accept ? "Accept" : "Decline"} suggestion"]`,
      )!
      .click();
    await vi.waitFor(() =>
      expect(view.state.field(inlineSuggestion)).toBeNull(),
    );
    expect(view.state.doc.toString()).toBe(accept ? corrected : source);
    expect(saved.at(-1)).toBe(accept ? corrected : source);
    if (accept) {
      undo(view);
      expect(view.state.doc.toString()).toBe(source);
    }
  },
);
