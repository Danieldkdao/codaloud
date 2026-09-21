import { Firecrawl } from "firecrawl";

import { serverEnv } from "@/data/env/server";

// Server-only. Use startCrawl/getCrawlStatus when a durable job owns the wait.
export const firecrawl = new Firecrawl({
  apiKey: serverEnv.FIRECRAWL_API_KEY,
  timeoutMs: 60_000,
  // Let the future task runner own retries of potentially billable operations.
  maxRetries: 0,
});
