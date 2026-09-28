import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { serverEnv } from "@/data/env/server";

// Server-only provider. Pass openrouter.chat(modelId) to AI SDK generation calls.
// Model choice, session IDs, token budgets, and tools belong to each accepted task.
export const openrouter = createOpenRouter({
  apiKey: serverEnv.OPENROUTER_API_KEY,
  compatibility: "strict",
  appName: "Codaloud",
});
