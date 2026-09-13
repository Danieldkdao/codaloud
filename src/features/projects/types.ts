import type { ProjectSelectData } from "@/db/schemas/project";
import type { ProjectFileEntrySchema } from "./actions/file-schemas";
import type { ProjectFileSearchPageSchema } from "./actions/file-search-schemas";

export type ProjectWorkspaceTab = "files" | "code" | "git" | "agent";

export type ProjectGitTab = "changes" | "history";

export type ProjectChangeData = {
  path: string;
  status: "modified" | "deleted" | "added" | "untracked";
  additions: number;
  deletions: number;
};

export type ProjectWorkspaceDiffFile = ProjectChangeData & {
  patch: string;
};

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

export type { ProjectFileSearchScope } from "./actions/file-search-schemas";

export type ReadProjectFilesActionResult<Input> = Input extends { search: string }
  ? ProjectFileSearchPageSchema
  : ProjectFileEntrySchema[];

export type ProjectFileSearchDocument = {
  path: string;
  content: string;
};

export type ProjectFileSearchResult = {
  file: ProjectFileSearchDocument;
  titleMatches: boolean;
  contentMatchCount: number;
};
