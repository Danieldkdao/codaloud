import { schedules } from "@trigger.dev/sdk";

export const retryProjectSandboxDispatches = schedules.task({
  id: "retry-project-sandbox-dispatches",
  cron: { pattern: "* * * * *", timezone: "UTC", environments: ["PRODUCTION"] },
  queue: { concurrencyLimit: 1 },
  maxDuration: 50,
  run: async () => {
    // Keep environment validation and database connections out of task discovery.
    const { retryPendingProjectSandboxes } = await import(
      "@/features/projects/server/retry-project-sandbox-dispatches"
    );
    return retryPendingProjectSandboxes();
  },
});
