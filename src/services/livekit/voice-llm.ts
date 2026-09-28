import { randomUUID } from "node:crypto";
import { DEFAULT_API_CONNECT_OPTIONS, llm } from "@livekit/agents";
import { tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import { voiceModel } from "@/features/voice/constants";
import { createVoiceReply } from "@/services/ai/voice-response";
import {
  createInlineVoiceTools,
  generateInlineVoiceEdit,
} from "@/services/ai/inline-voice-tools";
import { classifyInlineIntent } from "@/services/ai/inline-intent";
import { voiceContextSchema } from "@/features/voice/schemas";

export class VoiceLanguageModel extends llm.LLM {
  constructor(
    private readonly sessionId: string,
    private readonly proposePlan?: (
      instruction: string,
      id: string,
      title: string,
      contextId?: string,
    ) => Promise<unknown>,
    private readonly workspace?: {
      context: () => Promise<unknown>;
      rpc: (method: string, payload: unknown) => Promise<unknown>;
    },
  ) {
    super();
  }
  label = () => "codaloud.openrouter";
  get model() {
    return voiceModel;
  }
  get provider() {
    return "openrouter";
  }
  chat = (options: Parameters<llm.LLM["chat"]>[0]) => {
    let accepted: Promise<unknown> | undefined;
    let contextId: string | undefined;
    // Provider call IDs can repeat in later turns. Our deduplication identity
    // belongs to this turn, and stays stable for repeated calls within it.
    const requestId = randomUUID();
    return new VoiceLanguageModelStream(
      this,
      {
        ...options,
        connOptions: {
          ...DEFAULT_API_CONNECT_OPTIONS,
          ...options.connOptions,
          maxRetry: 0,
        },
      },
      this.sessionId,
      this.proposePlan
        ? {
            proposePlan: tool({
              description:
                "Present a Markdown implementation plan for the user to review. This does not start work. Only the app's approval button can dispatch the task.",
              inputSchema: z.object({
                title: z
                  .string()
                  .trim()
                  .min(1)
                  .max(80)
                  .describe(
                    "Short action title for the task list, 1–80 characters, such as 'Create settings screen'. Describe the requested outcome, not its status.",
                  ),
                instruction: z
                  .string()
                  .min(1)
                  .max(3000)
                  .describe(
                    "Self-contained Markdown plan, 1–3000 characters. Use short headings and bullets for the intended outcome, exact file paths in backticks, requested changes, and constraints. Preserve the user's requested content and explicitly requested Git operations. Expose uncertain names or assumptions for review; never invent editor context, files inspected, or authorization. This exact plan will become the implementation instruction after approval.",
                  ),
              }),
              execute: ({ instruction, title }, options) => {
                if (options.abortSignal?.aborted)
                  throw new Error("Request cancelled.");
                if (this.workspace && !contextId)
                  throw new Error("Workspace context is unavailable.");
                return (accepted ??= contextId
                  ? this.proposePlan!(instruction, requestId, title, contextId)
                  : this.proposePlan!(instruction, requestId, title));
              },
            }),
          }
        : undefined,
      this.workspace
        ? {
            ...this.workspace,
            context: async () => {
              const captured = voiceContextSchema.parse(
                await this.workspace!.context(),
              );
              contextId = captured.id;
              return captured;
            },
          }
        : undefined,
    );
  };
}

class VoiceLanguageModelStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    options: ConstructorParameters<typeof llm.LLMStream>[1],
    private readonly sessionId: string,
    private readonly tools?: ToolSet,
    private readonly workspace?: {
      context: () => Promise<unknown>;
      rpc: (method: string, payload: unknown) => Promise<unknown>;
    },
  ) {
    super(model, options);
  }
  protected run = async () => {
    const messages: ModelMessage[] = [];
    for (const item of this.chatCtx.items) {
      if (
        item.type === "message" &&
        (item.role === "user" || item.role === "assistant") &&
        item.textContent
      ) {
        messages.push({ role: item.role, content: item.textContent });
      }
    }
    const id = randomUUID();
    const context = this.workspace
      ? voiceContextSchema.parse(await this.workspace.context())
      : undefined;
    const tools =
      context && this.workspace
        ? {
            ...this.tools,
            ...createInlineVoiceTools(context, async (method, payload) => {
              if (this.abortController.signal.aborted)
                throw new Error("Request cancelled.");
              return this.workspace!.rpc(method, payload);
            }),
          }
        : this.tools;
    try {
      if (context?.mode === "quick-edit" && this.workspace) {
        const instruction = messages.findLast(
          (message) => message.role === "user",
        )?.content;
        if (typeof instruction !== "string") return;
        const intent = await classifyInlineIntent(
          instruction,
          this.abortController.signal,
        );
        if (this.abortController.signal.aborted) return;
        if (intent === "ignore") {
          // Nothing to act on, so close the turn without generating an edit.
          await this.workspace.rpc("codaloud.voice.suggestion", {
            id: context.id,
            type: "answer",
          });
          return;
        }
        // An "answer" intent falls through to the conversational reply below so
        // the user hears a real response. It keeps the inline read tools, so
        // the model can check diagnostics before speaking.
        if (intent === "edit") {
          await generateInlineVoiceEdit(
            context,
            messages,
            instruction,
            this.workspace.rpc,
            this.abortController.signal,
          );
          return;
        }
      }
      const reply = context
        ? createVoiceReply(
            messages,
            this.sessionId,
            this.abortController.signal,
            tools,
            context,
          )
        : createVoiceReply(
            messages,
            this.sessionId,
            this.abortController.signal,
            tools,
          );
      for await (const content of reply) {
        if (this.abortController.signal.aborted) break;
        this.queue.put({ id, delta: { role: "assistant", content } });
      }
      if (context && !this.abortController.signal.aborted)
        await this.workspace!.rpc("codaloud.voice.suggestion", {
          id: context.id,
          type: "answer",
        }).catch(() => {});
    } catch (error) {
      if (context)
        await this.workspace!.rpc("codaloud.voice.suggestion", {
          id: context.id,
          type: "error",
          message:
            context.mode === "quick-edit" && error instanceof Error
              ? error.message.slice(0, 1000)
              : "Response interrupted. Cancel and try again.",
        }).catch(() => {});
      if (!this.abortController.signal.aborted) throw error;
    }
  };
}
