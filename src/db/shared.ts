import { pgEnum } from "drizzle-orm/pg-core";

export const projectSetupStatuses = [
  "pending",
  "running",
  "ready",
  "failed",
] as const;
export type ProjectSetupStatus = (typeof projectSetupStatuses)[number];
export const projectSetupStatusEnum = pgEnum(
  "project_setup_statuses",
  projectSetupStatuses,
);
