import { describe, expect, it } from "vitest";
import {
  creditsForModelUsage,
  modelCostUsd,
  creditsForSpeech,
  creditsForVoiceMinutes,
  creditsForSandboxMinutes,
  reportedModelCostUsd,
} from "../credit-cost";

describe("approved credit meter", () => {
  it("rounds measured model cost up with an action minimum", () => {
    expect(creditsForModelUsage("openai/gpt-5.4-mini", { inputTokens: 10_000, outputTokens: 1_000 }, 1)).toBe(2);
    expect(creditsForModelUsage("openai/gpt-5.4-mini", { inputTokens: 10_000, outputTokens: 2_000 }, 2)).toBe(3);
    expect(creditsForModelUsage("deepseek/deepseek-v4.1-flash", { inputTokens: 0, outputTokens: 0 }, 2)).toBe(2);
    expect(modelCostUsd("openai/gpt-5.4-mini", { inputTokens: 10_000, outputTokens: 1_000 })).toBeCloseTo(0.012);
    const reported = reportedModelCostUsd({ openrouter: { usage: { cost: 0.025 } } });
    expect(creditsForModelUsage("openai/gpt-5.4-mini", { inputTokens: 10_000, outputTokens: 1_000, costUsd: reported }, 1)).toBe(4);
    expect(reportedModelCostUsd({ openrouter: { usage: { cost: -1 } } })).toBeUndefined();
  });

  it("rounds speech, voice, and compute by started units", () => {
    expect(creditsForSpeech(151)).toBe(2);
    expect(creditsForVoiceMinutes(61_000)).toBe(6);
    expect(creditsForSandboxMinutes(181_000)).toBe(2);
  });
});
