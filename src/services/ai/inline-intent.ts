import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import { classifyInlineIntentInstructions } from "./prompts";

export const inlineIntents = ["edit", "answer", "ignore"] as const;
export type InlineIntent = (typeof inlineIntents)[number];

export const inlineIntentDecisionSchema = z.object({
  answers: z.object({
    intent: z.object({
      type: z.literal("choice"),
      choice: z.enum(inlineIntents),
    }),
  }),
});
export type InlineIntentDecisionSchema = z.infer<
  typeof inlineIntentDecisionSchema
>;

// Criteria are mutually exclusive so Jev returns one winning intent instead of
// an independent edit probability. `edit` covers requests to change code plus
// questions about a concrete fault in the current file, because the corrective
// edit is the useful answer there. `answer` covers questions that need an
// explanation rather than a change. `ignore` absorbs speech that is not a
// request at all, which is what keeps retractions and filler from burning an
// edit generation.
const intentCriteria = {
  edit: "The user asks to insert, create, replace, fix, remove, rename, format or otherwise change code, with enough intent to act. References such as 'fix this' or 'add parentheses here' are valid because the editor supplies the target. Also valid: a question about a fault in the code currently open, such as 'why am I getting this error here', 'what is wrong with this line', or 'what is going on here', because resolving the fault in the editor is the useful response.",
  answer:
    "The user asks a question that needs an explanation, discussion or summary rather than a change to the code, such as 'what does this function do', 'how does this work', or 'why is this approach better'. The user wants to understand or be told something, not to have the code modified.",
  ignore:
    "Incomplete thoughts such as 'I wanted' or 'can you', filler, accidental speech, greetings, silence, cancellation such as 'never mind' or 'don't change anything', and speech that mentions code but requests no action and asks no question. An earlier request that the user retracts is not a current request.",
} as const;

/** Server-only: Jev uses OpenRouter's Decisions API, not chat completions. */
export const classifyInlineIntent = async (
  transcript: string,
  signal: AbortSignal,
): Promise<InlineIntent> => {
  if (signal.aborted) throw new Error("Request cancelled.");
  if (!transcript.trim()) return "ignore";
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
          intent: {
            type: "choice",
            instructions: classifyInlineIntentInstructions,
            criteria: intentCriteria,
          },
        },
      }),
    });
    if (!response.ok) throw new Error("Decision request failed.");
    const decision = inlineIntentDecisionSchema.parse(await response.json());
    if (controller.signal.aborted) throw new Error("Decision interrupted.");
    return decision.answers.intent.choice;
  } catch {
    if (signal.aborted) throw new Error("Request cancelled.");
    throw new Error(
      "Could not check your request. Nothing changed. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
};
