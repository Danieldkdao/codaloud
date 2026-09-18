export const projectSetupStatuses = [
  "pending",
  "running",
  "ready",
  "failed",
] as const;
export type ProjectSetupStatus = (typeof projectSetupStatuses)[number];
