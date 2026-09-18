import type { GitUndoMode } from "../server/git-undo-schemas";
import { format, isValid, parseISO } from "date-fns";

import type { CodeEditorMatchState } from "@/components/code-editor-matches";
import type {
  ProjectAgentActivityKind,
  ProjectAgentActivityStatus,
  ProjectFileSearchScope,
  ProjectGitTab,
  ProjectWorkspaceTab,
} from "@/features/projects/types";
import type {
  ProjectDiffComparison,
  ProjectDiffLine,
  ProjectDiffScope,
  ProjectWorkspaceDiffData,
} from "@/features/projects/types";
import type { ProjectGitFileState } from "../actions/change-schemas";
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
    case "local":
      return { title: "Local branches", icon: "git-branch" as const };
    case "remote":
      return { title: "Remote branches", icon: "cloud" as const };
  }
};

export const formatProjectFileSaveStatus = (status: ProjectFileSaveStatus) => {
  switch (status) {
    case "loading":
      return {
        label: "Loading file…",
        busy: true,
        icon: "cloud-sync-outline" as const,
        className: "text-muted-foreground",
      };
    case "pending":
      return {
        label: "Changes waiting to save…",
        busy: true,
        icon: "cloud-sync-outline" as const,
        className: "text-muted-foreground",
      };
    case "saving":
      return {
        label: "Saving file…",
        busy: true,
        icon: "cloud-sync-outline" as const,
        className: "text-muted-foreground",
      };
    case "saved":
      return {
        label: "File saved",
        busy: false,
        icon: "cloud-check-outline" as const,
        className: "text-success-foreground",
      };
    case "error":
      return {
        label: "Couldn't save file. Tap to retry.",
        busy: false,
        icon: "cloud-remove-outline" as const,
        className: "text-destructive",
      };
  }
};

export const formatCodeDiagnostic = (severity: DiagnosticSeverity) => {
  switch (severity) {
    case "error":
      return { icon: "x-circle" as const, className: "text-destructive" };
    case "warning":
      return { icon: "alert-triangle" as const, className: "text-warning" };
    case "info":
      return { icon: "info" as const, className: "text-info" };
  }
};

export const formatCodeDiagnosticCount = (count: number) =>
  count > 99 ? "99+" : String(count);

export const formatCodeAnalysisLabel = (analysis: CodeEditorAnalysis) => {
  switch (analysis.status) {
    case "checking":
      return "Checking code…";
    case "unavailable":
      return "Code analysis unavailable. Tap to retry.";
    case "unsupported":
      return "Code analysis is not available for this language.";
    case "ready": {
      const errors = analysis.diagnostics.filter(
        (item) => item.severity === "error",
      ).length;
      const warnings = analysis.diagnostics.filter(
        (item) => item.severity === "warning",
      ).length;
      const information = analysis.diagnostics.filter(
        (item) => item.severity === "info",
      ).length;
      return `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}, ${information} information message${information === 1 ? "" : "s"}. Show problems.`;
    }
  }
};

export const formatProjectFileKind = (kind: ProjectFileKind) => {
  switch (kind) {
    case "file":
      return {
        inputLabel: "File name",
        placeholder: "new-file.ts",
        successMessage: "File created",
        updateSuccessMessage: "File updated",
        deleteSuccessMessage: "File deleted",
      };
    case "folder":
      return {
        inputLabel: "Folder name",
        placeholder: "new-folder",
        successMessage: "Folder created",
        updateSuccessMessage: "Folder updated",
        deleteSuccessMessage: "Folder deleted",
      };
    default:
      throw new Error(`Unsupported file kind: ${kind satisfies never}`);
  }
};

export const formatProjectFileNameAction = (mode: "create" | "update") => {
  switch (mode) {
    case "create":
      return {
        cancelLabel: "Cancel creation",
        pendingLabel: "Creating item",
        errorTitle: "Couldn't create this item",
      };
    case "update":
      return {
        cancelLabel: "Cancel update",
        pendingLabel: "Updating item",
        errorTitle: "Couldn't update this item",
      };
    default:
      throw new Error(`Unsupported file name action: ${mode satisfies never}`);
  }
};

export const formatProjectFileDeletion = (
  kind: ProjectFileKind,
  name: string,
) => {
  switch (kind) {
    case "file":
      return {
        title: "Delete file?",
        description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      };
    case "folder":
      return {
        title: "Delete folder?",
        description: `Are you sure you want to delete "${name}" and all files and folders inside it? This action cannot be undone.`,
      };
    default:
      throw new Error(`Unsupported file kind: ${kind satisfies never}`);
  }
};

export const formatProjectSource = (
  source: CreateProjectSchema["source"],
): {
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
        description: "Start from scratch in an empty cloud workspace.",
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

export const formatProjectSetupStatus = (
  status: ProjectSetupStatus,
): {
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
      throw new Error(
        `Unsupported project setup status: ${status satisfies never}`,
      );
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
      throw new Error(
        `Unsupported project sort field: ${sortField satisfies never}`,
      );
  }
};

export const formatProjectSortOrder = (sortOrder: ProjectSortOrder): string => {
  switch (sortOrder) {
    case "asc":
      return "Ascending";
    case "desc":
      return "Descending";
    default:
      throw new Error(
        `Unsupported project sort order: ${sortOrder satisfies never}`,
      );
  }
};

export const formatCommitHash = (hash: string): string => hash.slice(0, 7);

export const formatCommitParent = (hash: string | null): string =>
  hash === null ? "None" : formatCommitHash(hash);

export const formatCommitTimestamp = (timestamp: string): string => {
  const date = parseISO(timestamp);
  return isValid(date)
    ? format(date, "MMM d, yyyy 'at' h:mm a")
    : "Date unavailable";
};

export const formatProjectUpdatedDate = (updatedAt: string): string => {
  const date = parseISO(updatedAt);
  return isValid(date)
    ? `Updated ${format(date, "MMM d, yyyy")}`
    : "Update date unavailable";
};

// Full Git messages include a body and often a trailing newline. List titles use only the subject.
export const formatCommitSubject = (message: string): string =>
  message.split(/\r?\n/, 1)[0].trim();

export const formatProjectBranchLabel = (
  branch: string | null,
  isLoading: boolean,
): string => branch ?? (isLoading ? "Loading branches…" : "Select branch");

export const formatProjectGitTab = (tab: ProjectGitTab) => {
  switch (tab) {
    case "changes":
      return "Changes";
    case "history":
      return "Commit History";
  }
};

export const formatProjectChangePath = (path: string) => {
  const separator = path.lastIndexOf("/");
  return {
    name: path.slice(separator + 1),
    directory: separator < 0 ? "Project root" : path.slice(0, separator),
  };
};

export const formatProjectChangeCount = (count: number) =>
  `${count} file${count === 1 ? "" : "s"}`;

export const formatProjectEditorTab = (path: string, openPaths: string[]) => {
  const file = formatProjectChangePath(path);
  const dot = file.name.lastIndexOf(".");
  const duplicates = openPaths.filter((other) => other !== path && formatProjectChangePath(other).name === file.name);
  let directory: string | null = null;
  if (duplicates.length) {
    const folders = path.split("/").slice(0, -1);
    directory = folders.length ? folders.join("/") : "Project root";
    for (let length = 1; length <= folders.length; length++) {
      const suffix = folders.slice(-length).join("/");
      if (duplicates.every((other) => other.split("/").slice(0, -1).slice(-length).join("/") !== suffix)) {
        directory = suffix;
        break;
      }
    }
  }
  return { name: dot > 0 ? file.name.slice(0, dot) : file.name, extension: dot > 0 ? file.name.slice(dot) : "", directory };
};

export const formatProjectEditorTabStyle = (selected: boolean) => selected
  ? { container: "bg-secondary border-primary", text: "text-secondary-foreground font-semibold" }
  : { container: "bg-background border-border", text: "text-muted-foreground" };

export const formatProjectChangeSelection = (selected: number, total: number) =>
  `${selected} of ${formatProjectChangeCount(total)} selected`;

export const formatProjectChangeLines = (
  additions: number,
  deletions: number,
) => ({
  additions: `+${additions}`,
  deletions: `−${deletions}`,
});

export const formatProjectDiffAccessibility = (
  additions: number,
  deletions: number,
) => ({
  additions: `${additions} added lines`,
  deletions: `${deletions} removed lines`,
});

export const formatProjectDiffSummary = (
  summary: ProjectWorkspaceDiffData["summary"],
) => {
  const additions = summary.staged.additions + summary.unstaged.additions;
  const deletions = summary.staged.deletions + summary.unstaged.deletions;
  const unavailable =
    summary.staged.unavailableCount + summary.unstaged.unavailableCount;
  const comparisons = summary.staged.fileCount + summary.unstaged.fileCount;
  if (comparisons > 0 && comparisons === unavailable) return null;
  const labels = formatProjectDiffAccessibility(additions, deletions);
  return {
    ...formatProjectChangeLines(additions, deletions),
    // Keep the compact visible totals while disclosing omitted previews to assistive technology.
    additionsLabel: unavailable
      ? `${labels.additions} in available previews`
      : labels.additions,
    deletionsLabel: unavailable
      ? `${labels.deletions} in available previews`
      : labels.deletions,
  };
};

export const formatProjectGitFileState = (status: ProjectGitFileState) => {
  switch (status) {
    case "unchanged":
      return "Unchanged";
    case "modified":
      return "Modified";
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    case "type-changed":
      return "File type changed";
    case "unmerged":
      return "Merge conflict";
    case "untracked":
      return "New file";
  }
};

export const formatProjectDiffScope = (scope: ProjectDiffScope) => {
  switch (scope) {
    case "staged":
      return "Staged";
    case "unstaged":
      return "Unstaged";
  }
};

export const formatProjectDiffUnavailable = (
  reason: Extract<ProjectDiffComparison, { kind: "unavailable" }>["reason"],
) => {
  switch (reason) {
    case "binary":
      return "Binary file or unsupported text encoding. Text preview unavailable.";
    case "too-large":
      return "This change is too large to preview.";
    case "unsupported":
      return "Text preview is unavailable for this file type.";
    case "conflict":
      return "Merge conflict. A two-way diff is unavailable until the conflict is resolved.";
    case "invalid-patch":
      return "Unable to display this patch. Refresh to try again.";
  }
};

export const formatProjectDiffRow = (line: ProjectDiffLine) => {
  switch (line.kind) {
    case "addition":
      return {
        prefix: "+ ",
        className: "bg-success",
        textClassName: "text-success-foreground",
        label: `Added line ${line.newLine}: ${line.text}`,
      };
    case "deletion":
      return {
        prefix: "− ",
        className: "bg-destructive/10",
        textClassName: "text-destructive",
        label: `Removed line ${line.oldLine}: ${line.text}`,
      };
    case "context":
      return {
        prefix: "  ",
        className: "",
        textClassName: "text-foreground",
        label: `Unchanged line ${line.newLine}: ${line.text}`,
      };
  }
};

export const formatProjectDiffDisclosure = (
  path: string,
  expanded: boolean,
) => ({
  label: `${expanded ? "Collapse" : "Expand"} ${path} diff`,
  icon: expanded ? ("chevron-up" as const) : ("chevron-down" as const),
});

export const formatProjectDiffLineNumber = (line: number | null) =>
  line === null ? "" : String(line);

export const formatProjectDiffMode = (mode: string) => {
  switch (mode) {
    case "000000":
      return "Missing file";
    case "100644":
      return "Regular file";
    case "100755":
      return "Executable file";
    case "120000":
      return "Symbolic link";
    case "160000":
      return "Submodule";
    default:
      return `Mode ${mode}`;
  }
};

export const formatCommitDate = (committedAt: string): string => {
  const date = parseISO(committedAt);
  return isValid(date) ? format(date, "MMM d") : "Date unavailable";
};

export const formatAgentActivityKind = (
  kind: ProjectAgentActivityKind,
): {
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
      throw new Error(
        `Unsupported agent activity kind: ${kind satisfies never}`,
      );
  }
};

export const formatAgentActivityStatus = (
  status: ProjectAgentActivityStatus,
): {
  label: string;
  icon: "clock" | "play-circle" | "check-circle" | "alert-circle";
  className: string;
  textClassName: string;
} => {
  switch (status) {
    case "queued":
      return {
        label: "Queued",
        icon: "clock",
        className: "bg-muted",
        textClassName: "text-muted-foreground",
      };
    case "running":
      return {
        label: "Running",
        icon: "play-circle",
        className: "bg-secondary",
        textClassName: "text-secondary-foreground",
      };
    case "complete":
      return {
        label: "Complete",
        icon: "check-circle",
        className: "bg-success",
        textClassName: "text-success-foreground",
      };
    case "failed":
      return {
        label: "Failed",
        icon: "alert-circle",
        className: "bg-destructive/10",
        textClassName: "text-destructive",
      };
    case "needs-attention":
      return {
        label: "Needs attention",
        icon: "alert-circle",
        className: "bg-accent/10",
        textClassName: "text-accent",
      };
    default:
      throw new Error(
        `Unsupported agent activity status: ${status satisfies never}`,
      );
  }
};

export const formatAgentActivityDate = (createdAt: string): string => {
  const date = parseISO(createdAt);
  return isValid(date) ? format(date, "MMM d 'at' h:mm a") : "Date unavailable";
};

export const formatWorkspaceTab = (tab: ProjectWorkspaceTab) => {
  switch (tab) {
    case "files":
      return {
        label: "Files",
        icon: { family: "Feather", name: "folder" },
      } as const;
    case "code":
      return {
        label: "Code",
        icon: { family: "Ionicons", name: "document-text-outline" },
      } as const;
    case "git":
      return {
        label: "Git",
        icon: { family: "MaterialCommunityIcons", name: "source-branch" },
      } as const;
    case "agent":
      return {
        label: "Agent",
        icon: { family: "Ionicons", name: "sparkles-outline" },
      } as const;
    default:
      throw new Error(`Unsupported workspace tab: ${tab satisfies never}`);
  }
};

export const formatWorkspaceSearch = (tab: string | undefined) => {
  switch (tab) {
    case "git":
      return { placeholder: "Search Git", accessibilityLabel: "Search Git" };
    case "agent":
      return {
        placeholder: "Search Activity",
        accessibilityLabel: "Search activity",
      };
    default:
      return {
        placeholder: "Search Files",
        accessibilityLabel: "Search files",
      };
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
    case "all":
      return "Title & content";
    case "title":
      return "File title";
    case "content":
      return "File content";
  }
};

export const formatProjectFileMatchCount = (count: number) => {
  if (count >= 100) return "100+ matches found in this file";
  return `${count} ${count === 1 ? "match" : "matches"} found in this file`;
};

export const formatProjectFileSearchCount = (count: number) =>
  `${count} ${count === 1 ? "file" : "files"}`;

export const formatProjectFileSearchCoverage = (
  scope: ProjectFileSearchScope,
  skippedContentFiles: number,
) => {
  const hasSkippedContent = scope !== "title" && skippedContentFiles > 0;
  return {
    notice: hasSkippedContent
      ? `Contents of ${formatProjectFileSearchCount(skippedContentFiles)} could not be searched.`
      : null,
    emptyTitle: hasSkippedContent
      ? "No matches in searched files"
      : "No matching files",
  };
};

export const formatProjectFileSearchPath = (path: string) => {
  const separator = path.lastIndexOf("/");
  return {
    name: path.slice(separator + 1),
    directory: separator < 0 ? "Workspace" : path.slice(0, separator),
  };
};

export const formatProjectFileSearchTitle = (
  name: string,
  query: string,
  scope: ProjectFileSearchScope,
) => {
  const search = query.trim();
  if (scope === "content" || !search)
    return [{ text: name, highlighted: false }];

  // Escape the literal query so filenames such as [id].tsx are not regex patterns.
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return name
    .split(new RegExp(`(${escapedSearch})`, "gi"))
    .map((text, index) => ({
      text,
      highlighted: index % 2 === 1,
    }));
};

export const formatProjectFilePreviewMatches = (
  state: CodeEditorMatchState | null,
) => {
  if (state === null)
    return { label: "…", accessibilityLabel: "Finding matches" };
  if (state.activeIndex === null || state.total === 0)
    return {
      label: "No matches",
      accessibilityLabel: "No matches in this file",
    };
  return {
    label: `${state.activeIndex + 1} / ${state.total}`,
    accessibilityLabel: `Match ${state.activeIndex + 1} of ${state.total}`,
  };
};

export const formatProjectGitCount = (count: number | null | undefined) =>
  count == null ? "—" : String(count);

export const formatProjectSyncAction = (
  action: "push" | "force-push" | "pull" | "pull-rebase" | "fetch",
) => {
  switch (action) {
    case "push":
      return { label: "Push", pending: "Pushing…", icon: "upload" as const };
    case "force-push":
      return {
        label: "Force Push",
        pending: "Force pushing…",
        icon: "chevrons-up" as const,
      };
    case "pull":
      return { label: "Pull", pending: "Pulling…", icon: "download" as const };
    case "pull-rebase":
      return {
        label: "Pull Rebase",
        pending: "Rebasing…",
        icon: "git-merge" as const,
      };
    case "fetch":
      return {
        label: "Fetch",
        pending: "Fetching…",
        icon: "download-cloud" as const,
      };
  }
};

export const formatProjectStashResult = (
  result: { created: boolean; remainingChanges: boolean } | null,
) => {
  if (!result) return null;
  if (result.remainingChanges)
    return "Stash saved. Some changes remain; review the Changes tab.";
  return result.created
    ? "Changes saved in a stash."
    : "No new changes to stash.";
};
export const formatProjectStashLabel = (index: number) => `View stash ${index}`;
export const formatProjectUndoMode = (mode: GitUndoMode) => {
  switch (mode) {
    case "soft":
      return {
        label: "Keep changes staged",
        description:
          "Remove the last commit and keep its changes staged. Existing working changes are kept.",
        success: "Last commit undone. Changes remain staged.",
      };
    case "mixed":
      return {
        label: "Keep changes unstaged",
        description:
          "Remove the last commit and keep its changes as uncommitted files. All staged changes become unstaged.",
        success: "Last commit undone. Changes remain in your files.",
      };
    case "hard":
      return {
        label: "Discard commit changes",
        description:
          "Remove the last commit AND discard tracked uncommitted changes. Untracked files in the way may also be removed. This cannot be restored from the app.",
        success: "Last commit and working changes discarded.",
      };
  }
};
export const formatProjectDiscardChoice = (includeUntracked: boolean) =>
  includeUntracked
    ? "Discard tracked and untracked changes"
    : "Discard tracked changes";
