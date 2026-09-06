import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { serverEnv } from "../data/env/server";
import * as schema from "./schema";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: serverEnv.DATABASE_URL });
export const db = drizzle(pool, { schema });

export type DbTransaction = Parameters<
  Parameters<(typeof db)["transaction"]>[0]
>[0];
