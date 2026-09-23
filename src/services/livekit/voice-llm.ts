import { randomUUID } from "node:crypto";
import { DEFAULT_API_CONNECT_OPTIONS, llm } from "@livekit/agents";
import { tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import { voiceModel } from "@/features/voice/constants";
import { createVoiceReply } from "@/services/ai/voice-response";

export class VoiceLanguageModel extends llm.LLM {
  constructor(
    private readonly sessionId: string,
    private readonly proposePlan?: (
      instruction: string,
      id: string,
      title: string,
    ) => Promise<unknown>,
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
              execute: ({ instruction, title }) =>
                (accepted ??= this.proposePlan!(instruction, requestId, title)),
            }),
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
    try {
      for await (const content of createVoiceReply(
        messages,
        this.sessionId,
        this.abortController.signal,
        this.tools,
      )) {
        if (this.abortController.signal.aborted) break;
        this.queue.put({ id, delta: { role: "assistant", content } });
      }
    } catch (error) {
      if (!this.abortController.signal.aborted) throw error;
    }
  };
}
