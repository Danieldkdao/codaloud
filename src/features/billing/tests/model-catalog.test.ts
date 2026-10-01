import { expect, it } from "vitest";
import {
  agentModelIds,
  defaultAgentModel,
  defaultInlineModel,
  getModelPricing,
  inlineModelIds,
} from "../model-catalog";

it("offers bounded inline and agent models with a price for every choice", () => {
  expect(inlineModelIds).toContain(defaultInlineModel);
  expect(agentModelIds).toContain(defaultAgentModel);
  for (const id of new Set([...inlineModelIds, ...agentModelIds])) {
    const pricing = getModelPricing(id);
    expect(pricing.inputUsdPerMillion).toBeGreaterThan(0);
    expect(pricing.outputUsdPerMillion).toBeGreaterThan(0);
  }
  expect(() => getModelPricing("unpriced/model")).toThrow(/unpriced/i);
});
