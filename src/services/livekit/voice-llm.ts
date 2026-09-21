import { randomUUID } from "node:crypto";
import { DEFAULT_API_CONNECT_OPTIONS, llm } from "@livekit/agents";
import type { ModelMessage } from "ai";
import { voiceModel } from "@/features/voice/constants";
import { createVoiceReply } from "@/services/ai/voice-response";

export class VoiceLanguageModel extends llm.LLM {
  constructor(private readonly sessionId: string) {
    super();
  }
  label = () => "codaloud.openrouter";
  get model() {
    return voiceModel;
  }
  get provider() {
    return "openrouter";
  }
  chat = (options: Parameters<llm.LLM["chat"]>[0]) =>
    new VoiceLanguageModelStream(
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
    );
}

class VoiceLanguageModelStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    options: ConstructorParameters<typeof llm.LLMStream>[1],
    private readonly sessionId: string,
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
      )) {
        if (this.abortController.signal.aborted) break;
        this.queue.put({ id, delta: { role: "assistant", content } });
      }
    } catch (error) {
      if (!this.abortController.signal.aborted) throw error;
    }
  };
}
