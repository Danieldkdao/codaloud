type ModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};
import { getModelPricing } from "./model-catalog";

export const reportedModelCostUsd = (metadata: unknown): number | undefined => {
  if (!metadata || typeof metadata !== "object" || !("openrouter" in metadata))
    return undefined;
  const openrouter = metadata.openrouter;
  if (!openrouter || typeof openrouter !== "object" || !("usage" in openrouter))
    return undefined;
  const usage = openrouter.usage;
  if (!usage || typeof usage !== "object" || !("cost" in usage))
    return undefined;
  const cost = usage.cost;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0
    ? cost
    : undefined;
};

const targetUsdPerCredit = 0.008;

export const modelCostUsd = (model: string, usage: ModelUsage) => {
  const { inputUsdPerMillion, outputUsdPerMillion } = getModelPricing(model);
  const input = Math.max(0, usage.inputTokens ?? 0);
  const output = Math.max(0, usage.outputTokens ?? 0);
  const estimatedCost =
    (input * inputUsdPerMillion + output * outputUsdPerMillion) / 1_000_000;
  const cost =
    usage.costUsd !== undefined && Number.isFinite(usage.costUsd)
      ? Math.max(estimatedCost, usage.costUsd)
      : estimatedCost;
  return cost;
};

export const creditsForModelUsage = (
  model: string,
  usage: ModelUsage,
  minimum: number,
) => {
  if (!Number.isSafeInteger(minimum) || minimum < 1)
    throw new Error("Invalid action minimum");
  return Math.max(
    minimum,
    Math.ceil(modelCostUsd(model, usage) / targetUsdPerCredit),
  );
};

export const creditsForSpeech = (characters: number) =>
  Math.ceil(Math.max(0, characters) / 150);

export const creditsForVoiceMinutes = (milliseconds: number) =>
  Math.ceil(Math.max(0, milliseconds) / 60_000) * 3;

export const creditsForSandboxMinutes = (milliseconds: number) =>
  Math.ceil(Math.max(0, milliseconds) / 180_000);
