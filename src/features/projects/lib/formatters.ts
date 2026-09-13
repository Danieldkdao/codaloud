import type { CodeEditorMatchState } from "@/components/code-editor-matches";
import type { ProjectAgentActivityKind, ProjectAgentActivityStatus, ProjectFileSearchScope, ProjectGitTab, ProjectWorkspaceTab } from "@/features/projects/types";
import type { ProjectSetupStatus } from "@/db/shared";
import type { CreateProjectSchema } from "@/features/projects/actions/schemas";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";
import type { DiagnosticSeverity } from "@/features/projects/actions/code-intelligence-schemas";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import type { ProjectFileSaveStatus } from "@/features/projects/hooks/use-project-file-save";
import type { ProjectBranchSource } from "@/features/projects/hooks/use-project-workspace-branch";
import type {
  ProjectSortField,
  ProjectSortOrder,
} from "@/features/projects/lib/project-params";

export const formatProjectBranchSource = (source: ProjectBranchSource) => {
  switch (source) {
    case "local": return { title: "Local branches", icon: "git-branch" as const };
    case "remote": return { title: "Remote branches", icon: "cloud" as const };
  }
};

export const formatProjectFileSaveStatus = (status: ProjectFileSaveStatus) => {
  switch (status) {
    case "loading": return { label: "Loading file…", busy: true, icon: "cloud-sync-outline" as const, className: "text-muted-foreground" };
    case "pending": return { label: "Changes waiting to save…", busy: true, icon: "cloud-sync-outline" as const, className: "text-muted-foreground" };
    case "saving": return { label: "Saving file…", busy: true, icon: "cloud-sync-outline" as const, className: "text-muted-foreground" };
    case "saved": return { label: "File saved", busy: false, icon: "cloud-check-outline" as const, className: "text-success-foreground" };
    case "error": return { label: "Couldn't save file. Tap to retry.", busy: false, icon: "cloud-remove-outline" as const, className: "text-destructive" };
  }
};

export const formatCodeDiagnostic = (severity: DiagnosticSeverity) => {
  switch (severity) {
    case "error": return { icon: "x-circle" as const, className: "text-destructive" };
    case "warning": return { icon: "alert-triangle" as const, className: "text-warning" };
    case "info": return { icon: "info" as const, className: "text-info" };
  }
};

export const formatCodeDiagnosticCount = (count: number) => count > 99 ? "99+" : String(count);

export const formatCodeAnalysisLabel = (analysis: CodeEditorAnalysis) => {
  switch (analysis.status) {
    case "checking": return "Checking code…";
    case "unavailable": return "Code analysis unavailable. Tap to retry.";
    case "unsupported": return "Code analysis is not available for this language.";
    case "ready": {
      const errors = analysis.diagnostics.filter((item) => item.severity === "error").length;
      const warnings = analysis.diagnostics.filter((item) => item.severity === "warning").length;
      const information = analysis.diagnostics.filter((item) => item.severity === "info").length;
      return `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}, ${information} information message${information === 1 ? "" : "s"}. Show problems.`;
    }
  }
};

export const formatProjectFileKind = (kind: ProjectFileKind) => {
  switch (kind) {
    case "file":
      return { inputLabel: "File name", placeholder: "new-file.ts", successMessage: "File created", updateSuccessMessage: "File updated", deleteSuccessMessage: "File deleted" };
    case "folder":
      return { inputLabel: "Folder name", placeholder: "new-folder", successMessage: "Folder created", updateSuccessMessage: "Folder updated", deleteSuccessMessage: "Folder deleted" };
    default:
      throw new Error(`Unsupported file kind: ${kind satisfies never}`);
  }
};

export const formatProjectFileNameAction = (mode: "create" | "update") => {
  switch (mode) {
    case "create":
      return { cancelLabel: "Cancel creation", pendingLabel: "Creating item", errorTitle: "Couldn't create this item" };
    case "update":
      return { cancelLabel: "Cancel update", pendingLabel: "Updating item", errorTitle: "Couldn't update this item" };
    default:
      throw new Error(`Unsupported file name action: ${mode satisfies never}`);
  }
};

export const formatProjectFileDeletion = (kind: ProjectFileKind, name: string) => {
  switch (kind) {
    case "file":
      return { title: "Delete file?", description: `Are you sure you want to delete "${name}"? This action cannot be undone.` };
    case "folder":
      return { title: "Delete folder?", description: `Are you sure you want to delete "${name}" and all files and folders inside it? This action cannot be undone.` };
    default:
      throw new Error(`Unsupported file kind: ${kind satisfies never}`);
  }
};

export const formatProjectSource = (source: CreateProjectSchema["source"]): {
  value: CreateProjectSchema["source"];
  icon: "box" | "github";
  title: string;
  description: string;
} => {
  switch (source) {
    case "new":
      return {
        value: source,
        icon: "box",
        title: "New project",
        description: "Start from scratch in an empty cloud sandbox.",
      };
    case "github":
      return {
        value: source,
        icon: "github",
        title: "Import from GitHub",
        description: "Start with an existing GitHub repository.",
      };
    default:
      throw new Error(`Unsupported project source: ${source satisfies never}`);
  }
};

export const formatProjectSetupStatus = (status: ProjectSetupStatus): {
  label: string;
  className: string;
  textClassName: string;
} => {
  switch (status) {
    case "pending":
      return {
        label: "Queued",
        className: "bg-muted",
        textClassName: "text-muted-foreground",
      };
    case "running":
      return {
        label: "Setting up",
        className: "bg-secondary",
        textClassName: "text-secondary-foreground",
      };
    case "ready":
      return {
        label: "Ready",
        className: "bg-secondary",
        textClassName: "text-secondary-foreground",
      };
    case "failed":
      return {
        label: "Setup failed",
        className: "bg-destructive/10",
        textClassName: "text-destructive",
      };
    default:
      throw new Error(`Unsupported project setup status: ${status satisfies never}`);
  }
};

export const formatProjectSortField = (sortField: ProjectSortField): string => {
  switch (sortField) {
    case "name":
      return "Name";
    case "createdAt":
      return "Date created";
    case "updatedAt":
      return "Last updated";
    default:
      throw new Error(`Unsupported project sort field: ${sortField satisfies never}`);
  }
};

export const formatProjectSortOrder = (sortOrder: ProjectSortOrder): string => {
  switch (sortOrder) {
    case "asc":
      return "Ascending";
    case "desc":
      return "Descending";
    default:
      throw new Error(`Unsupported project sort order: ${sortOrder satisfies never}`);
  }
};


export const formatCommitHash = (hash: string): string => hash.slice(0, 7);

// Full Git messages include a body and often a trailing newline. List titles use only the subject.
export const formatCommitSubject = (message: string): string => message.split(/\r?\n/, 1)[0].trim();

export const formatProjectBranchLabel = (branch: string | null, isLoading: boolean): string =>
  branch ?? (isLoading ? "Loading branches…" : "Select branch");

export const formatProjectGitTab = (tab: ProjectGitTab) => {
  switch (tab) {
    case "changes": return "Changes";
    case "history": return "Commit History";
  }
};

export const formatProjectChangePath = (path: string) => {
  const separator = path.lastIndexOf("/");
  return { name: path.slice(separator + 1), directory: separator < 0 ? "Project root" : path.slice(0, separator) };
};

export const formatProjectChangeCount = (count: number) => `${count} file${count === 1 ? "" : "s"}`;

export const formatProjectChangeSelection = (selected: number, total: number) => `${selected} of ${formatProjectChangeCount(total)} selected`;

export const formatProjectChangeLines = (additions: number, deletions: number) => ({
  additions: `+${additions}`,
  deletions: `−${deletions}`,
});

export const formatCommitDate = (committedAt: string): string =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(committedAt));


export const formatAgentActivityKind = (kind: ProjectAgentActivityKind): {
  label: string;
  icon: "mic" | "message-square" | "code" | "terminal" | "git-pull-request";
} => {
  switch (kind) {
    case "voice":
      return { label: "Voice command", icon: "mic" };
    case "text":
      return { label: "Text request", icon: "message-square" };
    case "symbol":
      return { label: "Symbol command", icon: "code" };
    case "command":
      return { label: "Terminal command", icon: "terminal" };
    case "review":
      return { label: "Code review", icon: "git-pull-request" };
    default:
      throw new Error(`Unsupported agent activity kind: ${kind satisfies never}`);
  }
};

export const formatAgentActivityStatus = (status: ProjectAgentActivityStatus): {
  label: string;
  icon: "clock" | "play-circle" | "check-circle" | "alert-circle";
  className: string;
  textClassName: string;
} => {
  switch (status) {
    case "queued":
      return { label: "Queued", icon: "clock", className: "bg-muted", textClassName: "text-muted-foreground" };
    case "running":
      return { label: "Running", icon: "play-circle", className: "bg-secondary", textClassName: "text-secondary-foreground" };
    case "complete":
      return { label: "Complete", icon: "check-circle", className: "bg-success", textClassName: "text-success-foreground" };
    case "failed":
      return { label: "Failed", icon: "alert-circle", className: "bg-destructive/10", textClassName: "text-destructive" };
    case "needs-attention":
      return { label: "Needs attention", icon: "alert-circle", className: "bg-accent/10", textClassName: "text-accent" };
    default:
      throw new Error(`Unsupported agent activity status: ${status satisfies never}`);
  }
};

export const formatAgentActivityDate = (createdAt: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));


export const formatWorkspaceTab = (tab: ProjectWorkspaceTab) => {
  switch (tab) {
    case "files": return { label: "Files", icon: { family: "Feather", name: "folder" } } as const;
    case "code": return { label: "Code", icon: { family: "Ionicons", name: "document-text-outline" } } as const;
    case "git": return { label: "Git", icon: { family: "Feather", name: "git-branch" } } as const;
    case "agent": return { label: "Agent", icon: { family: "Ionicons", name: "sparkles-outline" } } as const;
    default: throw new Error(`Unsupported workspace tab: ${tab satisfies never}`);
  }
};

export const formatWorkspaceSearch = (tab: string | undefined) => {
  switch (tab) {
    case "git":
      return { placeholder: "Search Git", accessibilityLabel: "Search Git" };
    case "agent":
      return { placeholder: "Search Activity", accessibilityLabel: "Search activity" };
    default:
      return { placeholder: "Search Files", accessibilityLabel: "Search files" };
  }
};

export const formatProjectFileSearchError = (code: string | undefined) => {
  switch (code) {
    case "SEARCH_LIMIT_EXCEEDED":
      return "This search is too large. Use a more specific search.";
    case "SEARCH_SESSION_EXPIRED":
      return "These search results expired. Try again to refresh them.";
    case "INVALID_SEARCH_CURSOR":
      return "These search results are no longer valid. Try again to refresh them.";
    case "SEARCH_WORKSPACE_CHANGED":
      return "Workspace files changed. Try again to refresh the search.";
    case "WORKSPACE_NOT_READY":
      return "Your workspace is not ready yet. Reopen the project, then try again.";
    case "WORKSPACE_RESTORING":
      return "Restoring your workspace. Please wait.";
    case "INVALID_FILE_SEARCH":
      return "This search could not be accepted. Change your search and try again.";
    case "INVALID_PATH":
      return "The search folder is unavailable. Reopen the project and try again.";
    case "SEARCH_BUSY":
      return "File search is busy. Please try again shortly.";
    case "SEARCH_UNAVAILABLE":
      return "File search is temporarily unavailable. Please try again.";
    default:
      return "Unable to search project files. Please try again.";
  }
};

export const formatProjectFileSearchScope = (scope: ProjectFileSearchScope) => {
  switch (scope) {
    case "all": return "Title & content";
    case "title": return "File title";
    case "content": return "File content";
  }
};

export const formatProjectFileMatchCount = (count: number) => {
  if (count >= 100) return "100+ matches found in this file";
  return `${count} ${count === 1 ? "match" : "matches"} found in this file`;
};

export const formatProjectFileSearchCount = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

export const formatProjectFileSearchCoverage = (scope: ProjectFileSearchScope, skippedContentFiles: number) => {
  const hasSkippedContent = scope !== "title" && skippedContentFiles > 0;
  return {
    notice: hasSkippedContent
      ? `Contents of ${formatProjectFileSearchCount(skippedContentFiles)} could not be searched.`
      : null,
    emptyTitle: hasSkippedContent ? "No matches in searched files" : "No matching files",
  };
};

export const formatProjectFileSearchPath = (path: string) => {
  const separator = path.lastIndexOf("/");
  return { name: path.slice(separator + 1), directory: separator < 0 ? "Workspace" : path.slice(0, separator) };
};

export const formatProjectFileSearchTitle = (name: string, query: string, scope: ProjectFileSearchScope) => {
  const search = query.trim();
  if (scope === "content" || !search) return [{ text: name, highlighted: false }];

  // Escape the literal query so filenames such as [id].tsx are not regex patterns.
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return name.split(new RegExp(`(${escapedSearch})`, "gi")).map((text, index) => ({
    text,
    highlighted: index % 2 === 1,
  }));
};


export const formatProjectFilePreviewMatches = (state: CodeEditorMatchState | null) => {
  if (state === null) return { label: "…", accessibilityLabel: "Finding matches" };
  if (state.activeIndex === null || state.total === 0) return { label: "No matches", accessibilityLabel: "No matches in this file" };
  return {
    label: `${state.activeIndex + 1} / ${state.total}`,
    accessibilityLabel: `Match ${state.activeIndex + 1} of ${state.total}`,
  };
};
