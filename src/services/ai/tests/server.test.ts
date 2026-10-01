import { expect, it, vi } from "vitest";

const chat = vi.hoisted(() => vi.fn());
vi.mock("@/data/env/server", () => ({ serverEnv: { OPENROUTER_API_KEY: "test" } }));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => ({ chat }),
}));

import { meteredChatModel } from "../server";

it("limits the provider price for each billed model and requests its actual cost", () => {
  meteredChatModel("openai/gpt-5.4-mini");
  expect(chat).toHaveBeenCalledWith("openai/gpt-5.4-mini", expect.objectContaining({
    usage: { include: true },
    provider: { max_price: { prompt: 0.9, completion: 5.4 } },
  }));

  meteredChatModel("deepseek/deepseek-v4.1-flash", { parallelToolCalls: false });
  expect(chat).toHaveBeenCalledWith("deepseek/deepseek-v4.1-flash", expect.objectContaining({
    parallelToolCalls: false,
    provider: { max_price: { prompt: 0.06, completion: 0.72 } },
  }));
  expect(() => meteredChatModel("unpriced/model")).toThrow("Unpriced model");
});
