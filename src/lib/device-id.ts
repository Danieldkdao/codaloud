import { randomUUID } from "expo-crypto";
import Storage from "expo-sqlite/kv-store";
import { z } from "zod";

const key = "codaloud.agent.device-id";
let pending: Promise<string> | null = null;

/** Shared identity for the agent and Daytona's device-owned sandbox. */
export const getDeviceId = () => {
  pending ??= (async () => {
    const existing = await Storage.getItem(key);
    if (existing) return z.uuid().parse(existing);
    const created = randomUUID();
    await Storage.setItem(key, created);
    return created;
  })().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
};
