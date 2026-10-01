import { db } from "@/db/local/db";
import { migrateDatabase } from "@/db/local/migrate";
import { DraftTable } from "@/db/local/schemas/draft";
import { ProjectTable } from "@/db/local/schemas/project";
import { WORKSPACE_FOLDER_NAME } from "@/features/projects/constants";
import { disconnectGitHub } from "@/services/github/credentials";
import { Directory, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";

export const clearDeletedAccountSession = async () => {
  await Promise.all([
    SecureStore.deleteItemAsync("codaloud_cookie"),
    SecureStore.deleteItemAsync("codaloud_session_data"),
  ]);
};

export const deleteLocalAccountData = async () => {
  await migrateDatabase();

  // Keep the open SQLite connection valid while clearing all user-owned rows.
  db.delete(DraftTable).run();
  db.delete(ProjectTable).run();

  for (const directory of [
    new Directory(Paths.document, WORKSPACE_FOLDER_NAME),
    new Directory(Paths.document, "codaloud-draft-assets"),
    new Directory(Paths.cache, "explanations"),
  ]) {
    if (directory.exists) directory.delete();
  }

  await Storage.clear();
  await disconnectGitHub();
  await Promise.all([
    SecureStore.deleteItemAsync("codaloud.theme"),
    clearDeletedAccountSession(),
  ]);
};
