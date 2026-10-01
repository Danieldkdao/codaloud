export const inlineModelIds = [
  "openai/gpt-5.4-mini",
  "google/gemini-3-flash-preview",
  "anthropic/claude-haiku-4.5",
] as const;
export type InlineModelId = (typeof inlineModelIds)[number];

export const agentModelIds = [
  "deepseek/deepseek-v4.1-flash",
  "google/gemini-3-flash-preview",
  "openai/gpt-5.4-mini",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.5",
] as const;
export type AgentModelId = (typeof agentModelIds)[number];

export const defaultInlineModel: InlineModelId = "openai/gpt-5.4-mini";
export const defaultAgentModel: AgentModelId = "deepseek/deepseek-v4.1-flash";

// Published OpenRouter base rates in USD per million tokens. The provider
// ceiling is 20% higher so an automatic route cannot silently outrun billing.
export const getModelPricing = (model: string) => {
  switch (model) {
    case "openai/gpt-5.4-mini":
      return { inputUsdPerMillion: 0.75, outputUsdPerMillion: 4.5 };
    case "deepseek/deepseek-v4.1-flash":
      return { inputUsdPerMillion: 0.05, outputUsdPerMillion: 0.6 };
    case "google/gemini-3-flash-preview":
      return { inputUsdPerMillion: 0.5, outputUsdPerMillion: 3 };
    case "anthropic/claude-haiku-4.5":
      return { inputUsdPerMillion: 1, outputUsdPerMillion: 5 };
    case "anthropic/claude-sonnet-4.5":
      return { inputUsdPerMillion: 3, outputUsdPerMillion: 15 };
    default:
      throw new Error(`Unpriced model: ${model}`);
  }
};
