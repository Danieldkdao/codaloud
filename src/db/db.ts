import { drizzle } from "drizzle-orm/expo-sqlite/driver";
import { openDatabaseSync } from "expo-sqlite";
import * as schema from "./schema";

const sqlite = openDatabaseSync("codaloud-workspace.db");

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
