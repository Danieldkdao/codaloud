import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import {
  deleteProjectSandbox,
  SandboxOwnershipError,
  type SandboxOwner,
} from "@/features/terminal/server/sandbox";

export const deleteProjectSandboxTask = task({
  id: "delete-project-sandbox",
  maxDuration: 120,
  machine: "micro",
  queue: { name: "sandbox-cleanup", concurrencyLimit: 2 },
  retry: {
    maxAttempts: 10,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async (payload: SandboxOwner & { sandboxId: string }) => {
    try {
      await deleteProjectSandbox(payload.sandboxId, payload);
    } catch (error) {
      if (error instanceof SandboxOwnershipError)
        throw new AbortTaskRunError(error.message);
      throw error;
    }
    return { deleted: true };
  },
});
