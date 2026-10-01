import Storage from "expo-sqlite/kv-store";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { z } from "zod";
import { getLocalProjects } from "@/features/projects/local/access";
import { getTerminalDeviceId, terminalApi } from "./terminal-client";

const storageKey = "codaloud.terminal.sandbox-cleanup";
const pendingCleanupSchema = z.strictObject({
  userId: z.string().min(1).max(200),
  projectId: z.uuid(),
  deviceId: z.uuid(),
  sandboxId: z.string().min(1).max(200),
});
export type PendingCleanupSchema = z.infer<typeof pendingCleanupSchema>;
const pendingCleanupsSchema = z.array(pendingCleanupSchema);
export type PendingCleanupsSchema = z.infer<typeof pendingCleanupsSchema>;
let currentUserId: string | null = null;
let draining: Promise<void> | null = null;

const readPending = () => {
  const saved = Storage.getItemSync(storageKey);
  return saved ? pendingCleanupsSchema.parse(JSON.parse(saved)) : [];
};
const cleanupKey = (entry: PendingCleanupSchema) =>
  `${entry.userId}:${entry.deviceId}:${entry.projectId}:${entry.sandboxId}`;
const writePending = (entries: PendingCleanupSchema[]) =>
  Storage.setItemSync(storageKey, JSON.stringify(entries));

export const prepareProjectSandboxCleanup = async (
  projectId: string,
  sandboxId: string,
) => {
  const userId = currentUserId;
  if (!userId)
    throw new Error("Sign in before deleting a project with a sandbox.");
  const entry = pendingCleanupSchema.parse({
    userId,
    projectId,
    sandboxId,
    deviceId: await getTerminalDeviceId(),
  });
  const key = cleanupKey(entry);
  writePending([
    ...readPending().filter((item) => cleanupKey(item) !== key),
    entry,
  ]);
  return key;
};

export const cancelProjectSandboxCleanup = (key: string) => {
  writePending(readPending().filter((entry) => cleanupKey(entry) !== key));
};

export const drainProjectSandboxCleanup = (): Promise<void> => {
  if (draining) return draining;
  const userId = currentUserId;
  if (!userId || !onlineManager.isOnline() || !focusManager.isFocused())
    return Promise.resolve();
  draining = (async () => {
    const store = await getLocalProjects();
    for (const entry of readPending()) {
      if (
        currentUserId !== userId ||
        !onlineManager.isOnline() ||
        !focusManager.isFocused()
      )
        break;
      if (entry.userId !== userId || store.read(entry.projectId)) continue;
      try {
        await terminalApi.deleteSandbox(
          entry.projectId,
          entry.deviceId,
          entry.sandboxId,
        );
        cancelProjectSandboxCleanup(cleanupKey(entry));
      } catch {
        // Keep the persisted request until the API acknowledges a durable job.
      }
    }
  })().finally(() => {
    draining = null;
  });
  return draining;
};

export const subscribeProjectSandboxCleanup = (userId: string) => {
  currentUserId = userId;
  const retry = () => {
    void drainProjectSandboxCleanup().catch(() => undefined);
  };
  const offlineSubscription = onlineManager.subscribe(retry);
  const focusSubscription = focusManager.subscribe(retry);
  const timer = setInterval(retry, 30_000);
  retry();
  return () => {
    offlineSubscription();
    focusSubscription();
    clearInterval(timer);
    if (currentUserId === userId) currentUserId = null;
  };
};
