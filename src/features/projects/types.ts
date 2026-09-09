import type { ProjectSelectData } from "@/db/schemas/project";

// The API serializes database timestamps as ISO strings.
export type ProjectResponseData = Omit<
  ProjectSelectData,
  "createdAt" | "updatedAt" | "lastOpenedAt"
> & {
  deletionRequested?: boolean;
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


export type ProjectCommitData = {
  hash: string;
  message: string;
  author: string;
  committedAt: string;
  isMerge?: boolean;
  refs?: string[];
};


export type ProjectBranchData = {
  name: string;
  commits: ProjectCommitData[];
};


export type ProjectAgentActivityKind =
  | "voice"
  | "text"
  | "symbol"
  | "command"
  | "review";

export type ProjectAgentActivityStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "needs-attention";

export type ProjectAgentActivityData = {
  id: string;
  kind: ProjectAgentActivityKind;
  status: ProjectAgentActivityStatus;
  title: string;
  description: string;
  createdAt: string;
  target?: string;
};
