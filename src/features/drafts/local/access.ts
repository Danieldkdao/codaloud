import { migrateDatabase } from "@/db/local/migrate";
import { localDraftStore } from "./drafts";

let initialized: Promise<void> | undefined;

// Drafts need no crash recovery: a row is written only once its content is durable.
export const getLocalDrafts = async () => {
  initialized ??= migrateDatabase().catch((error: unknown) => {
    initialized = undefined;
    throw error;
  });
  await initialized;
  return localDraftStore;
};
