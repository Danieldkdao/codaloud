import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { serverEnv } from "../data/env/server";
import * as schema from "./schema";

export type Db = NeonDatabase<typeof schema>;
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Call once per API request and await all database work inside the callback.
export const dbAction = async <T>(
  callback: (database: Db) => Promise<T>,
): Promise<T> => {
  const pool = new Pool({
    connectionString: serverEnv.DATABASE_URL,
  });

  try {
    const database = drizzle({ client: pool, schema });
    return await callback(database);
  } finally {
    await pool.end();
  }
};
