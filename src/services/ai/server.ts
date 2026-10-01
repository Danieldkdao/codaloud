import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { serverEnv } from "@/data/env/server";
import { getModelPricing } from "@/features/billing/model-catalog";

export const openrouter = createOpenRouter({
  apiKey: serverEnv.OPENROUTER_API_KEY,
  compatibility: "strict",
  appName: "Codaloud",
});

// The ceiling keeps an automatic provider fallback within the rates used by
// the credit meter. Request usage accounting for the actual inference cost.
export const meteredChatModel = (
  model: string,
  settings?: { parallelToolCalls?: boolean },
) => {
  const pricing = getModelPricing(model);
  const maxPrice = {
    prompt: Number((pricing.inputUsdPerMillion * 1.2).toFixed(6)),
    completion: Number((pricing.outputUsdPerMillion * 1.2).toFixed(6)),
  };
  return openrouter.chat(model, {
    ...settings,
    usage: { include: true },
    provider: { max_price: maxPrice },
  });
};
