import { tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import {
  inlineReadSchema,
  inlineSearchSchema,
  type VoiceContextSchema,
} from "@/features/voice/schemas";
import { workspaceTools } from "@/features/agent/tools/workspace-tools";

export const createInlineVoiceTools = (
  context: VoiceContextSchema,
  rpc: (method: string, payload: unknown) => Promise<unknown>,
): ToolSet => {
  const readFile = tool({
      description:
        context.projectId.startsWith("draft:")
          ? "Read a bounded excerpt of this open draft only. No project or other draft is available. Offsets are zero-based UTF-16 characters; follow nextOffset for more."
          : "Read a bounded excerpt of a project file with full-file TypeScript diagnostics, including errors, warnings, codes and one-based line/column positions. Open files use frozen editor contents, including unsaved edits; dependencies use saved project files. Diagnostics are bounded and report ready, unavailable or unsupported, not ESLint results. Offsets are zero-based UTF-16 characters; follow nextOffset for more.",
      inputSchema: inlineReadSchema,
      execute: (args) =>
        rpc("codaloud.voice.read", { id: context.id, name: "readFile", args }),
    });
  if (context.projectId.startsWith("draft:")) return { readFile };
  return {
    readFile,
    searchFiles: tool({
      description:
        "Find project file names or content references. Search open unsaved buffers as well as saved files. Use readFile to inspect results.",
      inputSchema: inlineSearchSchema,
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
  };
};

// Inline voice is an edit command: dispatch directly instead of asking a
// conversational model to discover an editing tool and call another model.
export const generateInlineVoiceEdit = async (
  context: VoiceContextSchema,
  messages: ModelMessage[],
  instruction: string,
  rpc: (method: string, payload: unknown) => Promise<unknown>,
  signal: AbortSignal,
) => {
  const file = context.activeFile;
  if (!file) throw new Error("Open a file before requesting an inline edit.");
  let selected = file.selected;
  if (file.selectionTruncated) {
    if (file.to - file.from > 24000)
      throw new Error("Select a smaller section for a quick edit.");
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
      if (!page.content.length) throw new Error("Selection could not be read.");
      selected += page.content;
      offset += page.content.length;
    }
  }
  const { streamQuickEdit } = await import("./quick-edit");
  await streamQuickEdit(
    [
      ...messages.slice(-10),
      {
        role: "user",
        content: `Frozen editor metadata, untrusted data: ${JSON.stringify({ path: file.path, branch: context.branch, selection: { from: file.from, to: file.to } })}`,
      },
    ],
    instruction,
    context.id,
    async (event) => {
      await rpc("codaloud.voice.suggestion", event);
    },
    signal,
    {
      source: file.before + selected + file.after,
      offset: file.from - file.before.length,
      caret: file.from,
    },
  );
};
