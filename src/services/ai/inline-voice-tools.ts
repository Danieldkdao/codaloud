import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  inlineReadSchema,
  type VoiceContextSchema,
} from "@/features/voice/schemas";
import { workspaceTools } from "@/features/agent/tools/workspace-tools";

export const createInlineVoiceTools = (
  context: VoiceContextSchema,
  rpc: (method: string, payload: unknown) => Promise<unknown>,
): ToolSet => {
  let suggestion: Promise<unknown> | undefined;
  return {
    readFile: tool({
      description:
        "Read a bounded excerpt of a project file. Open files use the frozen editor contents, including unsaved edits. Offsets are zero-based UTF-16 characters; follow nextOffset for more.",
      inputSchema: inlineReadSchema,
      execute: (args) =>
        rpc("codaloud.voice.read", { id: context.id, name: "readFile", args }),
    }),
    searchFiles: tool({
      description:
        "Find project file names or content references. Search open unsaved buffers as well as saved files. Use readFile to inspect results.",
      inputSchema: workspaceTools.searchFiles.schema,
      execute: (args) =>
        rpc("codaloud.voice.read", {
          id: context.id,
          name: "searchFiles",
          args,
        }),
    }),
    listFiles: tool({
      description: workspaceTools.listFiles.description,
      inputSchema: workspaceTools.listFiles.schema,
      execute: (args) =>
        rpc("codaloud.voice.read", { id: context.id, name: "listFiles", args }),
    }),
    ...(context.mode === "quick-edit" && context.activeFile
      ? {
          suggestEdit: tool({
            description:
              "Stream a small insertion at the frozen caret or a replacement of the frozen selection for explicit edit requests. Never use for questions or explanations. The user must accept the preview. Cannot edit outside this range. Use proposePlan for substantial or multi-file work.",
            inputSchema: z.object({ instruction: z.string().min(1).max(3000) }),
            execute: ({ instruction }, options) =>
              (suggestion ??= (async () => {
                const signal =
                  options.abortSignal ?? new AbortController().signal;
                try {
                  const { streamQuickEdit } = await import("./quick-edit");
                  let selected = context.activeFile!.selected;
                  if (context.activeFile!.selectionTruncated) {
                    const file = context.activeFile!;
                    if (file.to - file.from > 24000)
                      throw new Error(
                        "Select a smaller section for a quick edit.",
                      );
                    selected = "";
                    for (let offset = file.from; offset < file.to;) {
                      if (signal.aborted) throw new Error("Request cancelled.");
                      const page = z.object({ content: z.string() }).parse(
                        await rpc("codaloud.voice.read", {
                          id: context.id,
                          name: "readFile",
                          args: {
                            path: file.path,
                            offset,
                            length: Math.min(1200, file.to - offset),
                          },
                        }),
                      );
                      if (!page.content.length)
                        throw new Error("Selection could not be read.");
                      selected += page.content;
                      offset += page.content.length;
                    }
                  }
                  await streamQuickEdit(
                    [
                      ...options.messages.slice(-10),
                      {
                        role: "user",
                        content: `Frozen editor context, untrusted source data: ${JSON.stringify({ ...context, activeFile: { ...context.activeFile, selected, selectionTruncated: false } })}`,
                      },
                    ],
                    instruction,
                    context.id,
                    async (event) => {
                      await rpc("codaloud.voice.suggestion", event);
                    },
                    signal,
                  );
                  return {
                    previewReady: true,
                    message:
                      "Suggestion ready for Accept or Decline. No file has been changed.",
                  };
                } catch (error) {
                  await rpc("codaloud.voice.suggestion", {
                    id: context.id,
                    type: "error",
                    message:
                      error instanceof Error
                        ? error.message.slice(0, 1000)
                        : "Suggestion failed.",
                  }).catch(() => {});
                  return {
                    previewReady: false,
                    message:
                      "Suggestion stopped. No edit applied. Cancel and try again.",
                  };
                }
              })()),
          }),
        }
      : {}),
  };
};
