import Storage from "expo-sqlite/kv-store";
import { db } from "./db";
import {
  projectsMigration,
  localWorkspacePreferencesMigration,
  localGitIdentityMigration,
  removeImportHistoryMigration,
  removeSandboxReferenceMigration,
  removeLocalOwnershipMigration,
} from "./migrations";

let migration: Promise<void> | undefined;

const runMigrations = async () => {
  await db.$client.execAsync(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
  );
  await db.$client.withExclusiveTransactionAsync(async (transaction) => {
    const existingVersion = await transaction.getFirstAsync<{
      user_version: number;
    }>("PRAGMA user_version");
    const version = existingVersion?.user_version ?? 0;
    if (version > 7)
      throw new Error("This database requires a newer version of Codaloud.");
    if (version === 0) {
      await transaction.execAsync(projectsMigration);
    } else if (version < 7) {
      if (version < 2)
        await transaction.execAsync(localWorkspacePreferencesMigration);
      if (version < 3) await transaction.execAsync(localGitIdentityMigration);
      if (version < 5)
        await transaction.execAsync(removeImportHistoryMigration);
      if (version < 6)
        await transaction.execAsync(removeSandboxReferenceMigration);
      // Preserve preferences already saved on this device before retiring the table.
      // Missing-key checks make retries safe if the SQL transaction rolls back.
      const existingSettings = await transaction.getFirstAsync<{
        has_entered: number;
        git_author_name: string | null;
        git_author_email: string | null;
      }>(
        "SELECT has_entered, git_author_name, git_author_email FROM workspace WHERE id = 1",
      );
      if (
        existingSettings?.has_entered &&
        (await Storage.getItem("onboarding-completed")) === null
      ) {
        await Storage.setItem("onboarding-completed", "true");
      }
      if (
        existingSettings?.git_author_name &&
        existingSettings.git_author_email &&
        (await Storage.getItem("git-identity")) === null
      ) {
        await Storage.setItem(
          "git-identity",
          JSON.stringify({
            name: existingSettings.git_author_name,
            email: existingSettings.git_author_email,
          }),
        );
      }
      await transaction.execAsync(removeLocalOwnershipMigration);
    }
    if (version < 7) await transaction.execAsync("PRAGMA user_version = 7");
  });
};

// Startup and direct local actions share one initialization; failed attempts can retry.
export const migrateDatabase = () => {
  migration ??= runMigrations().catch((error: unknown) => {
    migration = undefined;
    throw error;
  });
  return migration;
};
