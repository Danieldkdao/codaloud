import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import { classifyEditIntentInstructions } from "./prompts";

export const inlineEditDecisionSchema = z.object({
  answers: z.object({
    edit: z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) }),
  }),
});
export type InlineEditDecisionSchema = z.infer<typeof inlineEditDecisionSchema>;

// Initial threshold checked with synthetic edits, fragments and retractions.
// Keep tuning against labeled real transcripts; uncertainty skips the edit.
const minimumEditProbability = 0.7;

/** Server-only: Jev uses OpenRouter's Decisions API, not chat completions. */
export const classifyInlineEditIntent = async (
  transcript: string,
  signal: AbortSignal,
): Promise<boolean> => {
  if (signal.aborted) throw new Error("Request cancelled.");
  if (!transcript.trim()) return false;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 5000);
  try {
    const response = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Codaloud",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "typesafe/jev-1.13",
        state: { transcript },
        questions: {
          edit: {
            type: "noul",
            instructions: classifyEditIntentInstructions,
            criteria: {
              true: "The user explicitly asks to insert, create, replace, fix, remove, rename, format or otherwise change code, with enough intent to act. References such as 'fix this' or 'add parentheses here' are valid because the editor supplies the target.",
              false:
                "Incomplete thoughts such as 'I wanted' or 'can you', filler, accidental speech, greetings, silence, cancellation such as 'never mind' or 'don't change anything', and requests only to explain, inspect or discuss code such as 'what is wrong here?' without asking to apply a fix. An earlier request that the user retracts is not a current edit request.",
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error("Decision request failed.");
    const decision = inlineEditDecisionSchema.parse(await response.json());
    if (controller.signal.aborted) throw new Error("Decision interrupted.");
    return decision.answers.edit.noul >= minimumEditProbability;
  } catch {
    if (signal.aborted) throw new Error("Request cancelled.");
    throw new Error(
      "Could not check your edit request. Nothing changed. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
};
