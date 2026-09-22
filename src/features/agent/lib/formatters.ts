import type { AgentTaskStatus } from "../schemas";
import type { AgentTaskRecord } from "../types";
import type { WorkspaceToolName } from "../tools/workspace-tools";

export const formatWorkspaceAction = (name: WorkspaceToolName) => {
  switch (name) {
    case "readFile":
      return "Read file";
    case "listFiles":
      return "Browse folder";
    case "searchFiles":
      return "Search files";
    case "saveFile":
      return "Save file";
    case "editFile":
      return "Edit file";
    case "createFile":
      return "Create file or folder";
    case "renameFile":
      return "Rename file or folder";
    case "deleteFile":
      return "Delete file or folder";
    case "gitBranches":
      return "Read branches";
    case "gitHistory":
      return "Read commit history";
    case "gitCommitDetails":
      return "Inspect commit";
    case "gitStatus":
      return "Check Git status";
    case "gitChanges":
      return "Review changes";
    case "gitCommit":
      return "Commit changes";
    case "gitCheckout":
      return "Switch branch";
    case "gitCreateBranch":
      return "Create branch";
    case "gitDeleteBranch":
      return "Delete branch";
    case "gitFetch":
      return "Fetch remote changes";
    case "gitPush":
      return "Push commits";
    case "gitPull":
      return "Pull changes";
    case "gitStashes":
      return "Read stashes";
    case "gitStash":
      return "Stash changes";
    case "gitApplyStash":
      return "Restore stash";
    case "gitDeleteStash":
      return "Delete stash";
    case "gitDiscardPreview":
      return "Preview changes to discard";
    case "gitDiscard":
      return "Discard changes";
    case "gitUndo":
      return "Undo commit";
    case "gitRevert":
      return "Revert commit";
    case "publishRepository":
      return "Publish repository";
  }
};
export const formatTaskStatus = (status: AgentTaskStatus) => {
  switch (status) {
    case "queued":
      return {
        label: "Queued",
        icon: "clock" as const,
        className: "text-muted-foreground",
      };
    case "running":
      return {
        label: "Working",
        icon: "loader" as const,
        className: "text-primary",
      };
    case "waiting":
      return {
        label: "Working on your device",
        icon: "smartphone" as const,
        className: "text-primary",
      };
    case "completed":
      return {
        label: "Completed",
        icon: "check-circle" as const,
        className: "text-success-foreground",
      };
    case "failed":
      return {
        label: "Needs attention",
        icon: "alert-circle" as const,
        className: "text-destructive",
      };
  }
};
export const formatTaskCounts = (records: readonly AgentTaskRecord[]) => {
  const completed = records.filter(
    (record) => record.event.status === "completed",
  ).length;
  const failed = records.filter(
    (record) => record.event.status === "failed",
  ).length;
  const active = records.length - completed - failed;
  return [
    active ? `${active} in progress` : "",
    completed ? `${completed} completed` : "",
    failed ? `${failed} need attention` : "",
  ]
    .filter(Boolean)
    .join(" · ");
};
