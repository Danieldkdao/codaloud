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

export const projectOperationKinds = ["prepare", "resume", "delete"] as const;
export type ProjectOperationKind = (typeof projectOperationKinds)[number];
export const projectOperationKindEnum = pgEnum(
  "project_operation_kinds",
  projectOperationKinds,
);

export const projectOperationStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type ProjectOperationStatus = (typeof projectOperationStatuses)[number];
export const projectOperationStatusEnum = pgEnum(
  "project_operation_statuses",
  projectOperationStatuses,
);

export const projectOperationPhases = [
  "queued",
  "creating-sandbox",
  "starting-sandbox",
  "preparing-files",
  "deleting-sandbox",
  "complete",
] as const;
export type ProjectOperationPhase = (typeof projectOperationPhases)[number];
export const projectOperationPhaseEnum = pgEnum(
  "project_operation_phases",
  projectOperationPhases,
);
