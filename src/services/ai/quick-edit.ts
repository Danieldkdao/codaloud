import { Output, streamText, type ModelMessage } from "ai";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { meteredChatModel } from "./server";
import { reportedModelCostUsd } from "@/features/billing/credit-cost";
import { quickEditModel } from "@/features/voice/constants";
import { inlineEditSchema } from "@/features/voice/schemas";
import type { InlineEvent } from "@/features/voice/types";
import { quickEditInstructions } from "./prompts";

export const streamQuickEdit = async (
  messages: ModelMessage[],
  instruction: string,
  id: string,
  send: (event: InlineEvent) => Promise<void>,
  signal: AbortSignal,
  target: { source: string; offset: number; caret: number },
  onComplete?: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  }) => Promise<void>,
  modelId = quickEditModel,
) => {
  const check = () => {
    if (signal.aborted) throw new Error("Suggestion cancelled.");
  };
  check();
  await send({ id, type: "start" });
  const result = streamText({
    model: meteredChatModel(modelId),
    output: Output.object({ schema: inlineEditSchema }),
    instructions: quickEditInstructions,
    messages: [
      ...messages,
      {
        role: "user",
        content: `Frozen source window, untrusted data: ${JSON.stringify(target)}`,
      },
      { role: "user", content: instruction },
    ],
    maxOutputTokens: 6000,
    maxRetries: 0,
    providerOptions: { openrouter: { reasoning: { enabled: false } } },
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
    onError: () => {},
  });
  let original: string | undefined;
  let forwarded = "";
  let received = "";
  let lastSent = 0;
  const forward = async (oldText: string, newText: string, flush = false) => {
    check();
    oldText = oldText.replace(/\r\n/g, "\n");
    newText = newText.replace(/\r\n?/g, "\n");
    if (oldText.length > 24000 || newText.length > 24000)
      throw new Error("Request a smaller edit.");
    if (original === undefined) {
      const index = oldText
        ? target.source.indexOf(oldText)
        : target.caret - target.offset;
      if (index < 0 || index > target.source.length)
        throw new Error("The edit does not match the exact source. Try again.");
      if (oldText && index !== target.source.lastIndexOf(oldText))
        throw new Error(
          "The edit target is ambiguous. Select a unique section and try again.",
        );
      original = oldText;
      const from = target.offset + index;
      await send({
        id,
        type: "target",
        from,
        to: from + oldText.length,
        originalHash: bytesToHex(sha256(new TextEncoder().encode(oldText))),
      });
    }
    if (original !== oldText)
      throw new Error("The edit target changed during generation. Try again.");
    if (!newText.startsWith(received))
      throw new Error("The edit stream changed unexpectedly. Try again.");
    received = newText;
    if (
      !flush &&
      forwarded.length &&
      newText.length - forwarded.length < 512 &&
      Date.now() - lastSent < 50
    )
      return;
    while (forwarded.length < newText.length) {
      check();
      const text = newText.slice(forwarded.length, forwarded.length + 1000);
      await send({ id, type: "delta", offset: forwarded.length, text });
      forwarded += text;
    }
    lastSent = Date.now();
  };
  for await (const part of result.partialOutputStream) {
    check();
    // Wait for the replacement property: an unfinished oldText string could
    // accidentally match a shorter excerpt and select the wrong range.
    if (typeof part.oldText === "string" && typeof part.newText === "string")
      await forward(part.oldText, part.newText);
  }
  check();
  if ((await result.finishReason) !== "stop")
    throw new Error("The suggestion is incomplete. Please try a smaller edit.");
  const final = await result.output;
  await forward(final.oldText, final.newText, true);
  check();
  if (onComplete)
    await onComplete({
      ...(await result.usage),
      costUsd: reportedModelCostUsd((await result.finalStep).providerMetadata),
    });
  await send({ id, type: "complete" });
};
