import { db } from "./db";
import { localWorkspaceMigration, localWorkspacePreferencesMigration, localGitIdentityMigration, localImportHistoryMigration } from "./migrations";

// Workspace startup awaits migrations before exposing the app to database readers.
export const migrateDatabase = async () => {
  await db.$client.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  await db.$client.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    const version = row?.user_version ?? 0;
    if (version > 4) {
      throw new Error("This workspace requires a newer version of Codaloud.");
    }
    if (version < 1) await transaction.execAsync(localWorkspaceMigration);
    if (version < 2) await transaction.execAsync(localWorkspacePreferencesMigration);
    if (version < 3) await transaction.execAsync(localGitIdentityMigration);
    if (version < 4) await transaction.execAsync(localImportHistoryMigration);
    await transaction.execAsync("PRAGMA user_version = 4");
  });
};
