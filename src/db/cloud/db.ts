import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { serverEnv } from "../../data/env/server";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

// Standalone auth lookups use HTTP, avoiding a fresh WebSocket handshake on
// every voice session. Interactive transactions still use the bounded pool.
neonConfig.poolQueryViaFetch = true;
neonConfig.fetchFunction = async (
  input: RequestInfo | URL,
  init?: RequestInit,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};
const pool = new Pool({
  connectionString: serverEnv.DATABASE_URL,
  connectionTimeoutMillis: 8000,
  query_timeout: 8000,
});
// Idle transaction sockets may be closed by the service. Do not crash the API
// process or log query parameters/session tokens from the underlying error.
pool.on("error", () => console.warn("Cloud database connection closed."));

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
