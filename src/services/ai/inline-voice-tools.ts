import type { ModelMessage, ToolSet } from "ai";
import { z } from "zod";
import { type VoiceContextSchema } from "@/features/voice/schemas";
import { createCommandTools } from "@/features/voice/command-tools";

export const createInlineVoiceTools = (
  context: VoiceContextSchema,
  rpc: (method: string, payload: unknown) => Promise<unknown>,
): ToolSet => {
  return createCommandTools(context, rpc);
};

// Inline voice is an edit command: dispatch directly instead of asking a
// conversational model to discover an editing tool and call another model.
export const generateInlineVoiceEdit = async (
  context: VoiceContextSchema,
  messages: ModelMessage[],
  instruction: string,
  rpc: (method: string, payload: unknown) => Promise<unknown>,
  signal: AbortSignal,
  onComplete?: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  }) => Promise<void>,
  modelId?: string,
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
    onComplete,
    modelId,
  );
};
