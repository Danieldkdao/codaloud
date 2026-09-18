import type { ApiResponse } from "@/lib/types";
import type { ProjectSelectData } from "@/db/schemas/project";
import type { ProjectFileEntrySchema } from "./actions/file-schemas";
import type { ProjectFileSearchPageSchema } from "./actions/file-search-schemas";
import type {
  ProjectDiffUnavailableReason,
  ProjectRepositoryChangeSchema,
  ProjectRepositoryChangesSchema,
} from "./actions/change-schemas";

export type ProjectWorkspaceTab = "files" | "code" | "git" | "agent";

export type ProjectGitTab = "changes" | "history";

export type ProjectDiffScope = "staged" | "unstaged";

export type ProjectDiffLine = {
  kind: "context" | "addition" | "deletion";
  text: string;
  oldLine: number | null;
  newLine: number | null;
  noNewline: boolean;
};

export type ProjectDiffHunk = {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: ProjectDiffLine[];
  /** Only this hunk's source text, including its original line endings. */
  beforeText: string;
  /** Omitted context between hunks is never reconstructed as file contents. */
  afterText: string;
};

export type ProjectDiffPatch = {
  metadata: string[];
  hunks: ProjectDiffHunk[];
  additions: number;
  deletions: number;
};

export type ProjectDiffComparison = {
  key: string;
  scope: ProjectDiffScope;
  beforePath: string | null;
  afterPath: string | null;
  beforeMode: string | null;
  afterMode: string | null;
} & (
  | ({ kind: "available" } & ProjectDiffPatch)
  | {
      kind: "unavailable";
      reason: ProjectDiffUnavailableReason | "invalid-patch";
      additions: null;
      deletions: null;
    }
);

export type ProjectWorkspaceDiffEntry = Pick<
  ProjectRepositoryChangeSchema,
  "path" | "originalPath" | "indexStatus" | "worktreeStatus"
> & {
  staged: ProjectDiffComparison | null;
  unstaged: ProjectDiffComparison | null;
};

export type ProjectWorkspaceDiffRow = { key: string; path: string } & (
  | { kind: "file"; file: ProjectWorkspaceDiffEntry }
  | { kind: "comparison"; comparison: ProjectDiffComparison; status: ProjectWorkspaceDiffEntry["indexStatus"] }
  | { kind: "line"; line: ProjectDiffLine }
);

export type ProjectDiffTotals = {
  fileCount: number;
  /** Counts cover available text previews; unavailableCount discloses omissions. */
  additions: number;
  deletions: number;
  unavailableCount: number;
};

export type ProjectWorkspaceDiffData = Omit<
  ProjectRepositoryChangesSchema,
  "changes"
> & {
  files: ProjectWorkspaceDiffEntry[];
  summary: {
    fileCount: number;
    staged: ProjectDiffTotals;
    unstaged: ProjectDiffTotals;
  };
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

export type ProjectGitReadFailureHandler = (
  status: number,
  retryAfter: string | null,
  code?: string,
) => void;

export type ProjectGitMutationFailure = Extract<ApiResponse, { error: true }>;

export type ProjectGitMutationResult<T> =
  | ProjectGitMutationFailure
  | { error: false; message: string; data: T };

export type ProjectGitMutationContext = {
  userId: string | null;
  projectId: string | null | undefined;
};

export type ProjectOpenFilesState = {
  openFilePaths: Set<string>;
  activeFilePath: string | null;
  versions: Map<string, number>;
};
