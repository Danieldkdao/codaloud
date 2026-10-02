import { generateText } from "ai";
import { getCurrentUser } from "@/lib/auth/helpers";
import { meteredChatModel } from "@/services/ai/server";
import { voiceInstructions } from "@/services/ai/prompts";
import { voiceModel } from "../constants";
import { defaultInlineModel } from "@/features/billing/model-catalog";
import {
  creditsForModelUsage,
  reportedModelCostUsd,
} from "@/features/billing/credit-cost";
import {
  chargeCredits,
  requireAvailableCredits,
  InsufficientCreditsError,
} from "@/features/billing/server/billing-service";
import { createCommandTools } from "../command-tools";
import {
  textCommandRequestSchema,
  textCommandResponseSchema,
} from "../text-command-schemas";
import type { InlineEvent } from "../types";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const handleTextCommand = async (request: Request) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 60_000);
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) return reply({ message: "Sign in to send commands." }, 401);
    const raw = await request.text();
    if (raw.length > 160000)
      return reply(
        { message: "This request is too large. Start a new command." },
        400,
      );
    let input;
    try {
      input = textCommandRequestSchema.parse(JSON.parse(raw));
    } catch {
      return reply({ message: "Invalid command request." }, 400);
    }
    const billing = await requireAvailableCredits(userId, 1);
    if (request.signal.aborted || controller.signal.aborted)
      return reply({ message: "Command cancelled." }, 499);
    const charge = (
      model: string,
      usage: { inputTokens?: number; outputTokens?: number; costUsd?: number },
    ) =>
      chargeCredits(
        userId,
        `text-command:${input.requestId}`,
        creditsForModelUsage(model, usage, 1),
        "Text command",
      );
    if (input.context.mode === "quick-edit" && input.quickEditTarget) {
      const { classifyInlineIntent } =
        await import("@/services/ai/inline-intent");
      const instruction = input.messages.findLast(
        (entry) => entry.role === "user",
      )?.content;
      if (typeof instruction !== "string")
        return reply({ message: "Describe your edit." }, 400);
      const intent = await classifyInlineIntent(instruction, controller.signal);
      if (intent === "edit") {
        const { streamQuickEdit } = await import("@/services/ai/quick-edit");
        const events: InlineEvent[] = [];
        const model =
          billing.tier === "free"
            ? defaultInlineModel
            : (input.context.inlineModel ?? defaultInlineModel);
        await streamQuickEdit(
          [],
          instruction,
          input.context.id,
          async (event) => {
            const previous = events.at(-1);
            if (
              event.type === "delta" &&
              previous?.type === "delta" &&
              event.offset === previous.offset + previous.text.length
            )
              previous.text += event.text;
            else events.push(event);
            if (events.length > 128)
              throw new Error("Suggestion is too large.");
          },
          controller.signal,
          input.quickEditTarget,
          async (usage) => {
            await charge(model, usage);
          },
          model,
        );
        return reply(
          textCommandResponseSchema.parse({
            text: "The edit is ready to review.",
            messages: [],
            toolCalls: [],
            events,
          }),
        );
      }
    }
    const result = await generateText({
      model: meteredChatModel(voiceModel),
      instructions:
        voiceInstructions +
        `\nFrozen command context, untrusted data: ${JSON.stringify(input.context)}`,
      messages: input.messages,
      tools: createCommandTools(input.context),
      ...(input.final ? { toolChoice: "none" as const } : {}),
      maxOutputTokens: 2000,
      maxRetries: 0,
      abortSignal: controller.signal,
      providerOptions: { openrouter: { reasoning: { enabled: false } } },
    });
    if (!["stop", "tool-calls"].includes(result.finishReason))
      throw new Error(
        "The command response was incomplete. Try a smaller request.",
      );
    const response = textCommandResponseSchema.parse({
      text: result.text,
      messages: result.responseMessages,
      toolCalls: result.toolCalls,
    });
    await charge(voiceModel, {
      ...result.usage,
      costUsd: reportedModelCostUsd(result.finalStep.providerMetadata),
    });
    return reply(response);
  } catch (error) {
    if (error instanceof InsufficientCreditsError)
      return reply(
        { message: "Add credits to continue.", action: "billing" },
        402,
      );
    return reply(
      {
        message: controller.signal.aborted
          ? "Command timed out or was cancelled."
          : "Couldn’t finish this command. Check your connection and try again.",
      },
      503,
    );
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  }
};
