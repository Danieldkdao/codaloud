import { streamText, type ModelMessage } from "ai";
import { openrouter } from "./server";
import { voiceInstructions, voiceModel } from "@/features/voice/constants";

export const createVoiceReply = (
  messages: ModelMessage[],
  sessionId: string,
  signal?: AbortSignal,
): AsyncIterable<string> => ({
  [Symbol.asyncIterator]: () => {
    const controller = new AbortController();
    const result = streamText({
      model: openrouter.chat(voiceModel),
      system: voiceInstructions,
      messages: messages.slice(-12).map((message): ModelMessage => {
        if (message.role !== "tool" && typeof message.content === "string") {
          return { ...message, content: message.content.slice(-4000) };
        }
        return message;
      }),
      maxOutputTokens: 512,
      maxRetries: 0,
      headers: { "X-Session-Id": sessionId },
      abortSignal: AbortSignal.any([
        controller.signal,
        ...(signal ? [signal] : []),
        AbortSignal.timeout(45_000),
      ]),
    });
    const iterator = result.textStream[Symbol.asyncIterator]();
    return {
      next: () => iterator.next(),
      // Abort immediately, even if a provider chunk is still pending.
      return: async () => {
        controller.abort();
        await iterator.return?.();
        return { done: true, value: undefined };
      },
    };
  },
});
