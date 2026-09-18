import { drizzle } from "drizzle-orm/expo-sqlite/driver";
import { openDatabaseAsync } from "expo-sqlite";
import { localWorkspaceMigration, localWorkspacePreferencesMigration, localGitIdentityMigration, localImportHistoryMigration } from "./migrations";
import * as schema from "./project";

const openLocalDatabase = async () => {
  const sqlite = await openDatabaseAsync("codaloud-workspace.db");
  try {
    await sqlite.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    await sqlite.withExclusiveTransactionAsync(async (transaction) => {
      const row = await transaction.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
      const version = row?.user_version ?? 0;
      if (version > 4) {
        throw new Error("This workspace requires a newer version of Codaloud.");
      }
      if (version < 1) {
        await transaction.execAsync(localWorkspaceMigration);
      }
      if (version < 2) await transaction.execAsync(localWorkspacePreferencesMigration);
      if (version < 3) await transaction.execAsync(localGitIdentityMigration);
      if (version < 4) await transaction.execAsync(localImportHistoryMigration);
      await transaction.execAsync("PRAGMA user_version = 4");
    });
    return drizzle(sqlite, { schema });
  } catch (error) {
    await sqlite.closeAsync();
    throw error;
  }
};

export type LocalDatabase = Awaited<ReturnType<typeof openLocalDatabase>>;
let database: Promise<LocalDatabase> | undefined;

export const getLocalDatabase = () => {
  database ??= openLocalDatabase().catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
};
