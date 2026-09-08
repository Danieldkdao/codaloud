import type { ProjectSelectData } from "@/db/schemas/project";

// The API serializes database timestamps as ISO strings.
export type ProjectResponseData = Omit<
  ProjectSelectData,
  "createdAt" | "updatedAt" | "lastOpenedAt"
> & {
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};

export type ProjectPageData = {
  projects: ProjectResponseData[];
  nextCursor: string | null;
};

export type ProjectSandboxLifecycleContext = {
  operationId?: string;
  projectId: string;
  userId: string;
  runId: string;
};

export type ProjectSandboxLifecycleTransition =
  | { action: "start" }
  | { action: "attach"; sandboxId: string }
  | { action: "complete"; sandboxId: string }
  | { action: "fail" };
