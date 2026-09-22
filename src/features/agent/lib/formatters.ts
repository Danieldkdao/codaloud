import type { AgentTaskStatus } from "../schemas";
import type { IconProps } from "@/components/ui/icon";
import type { AgentTaskRecord } from "../types";
import {
  workspaceTools,
  type WorkspaceToolName,
} from "../tools/workspace-tools";

export const formatWorkspaceActionIcon = (
  name: WorkspaceToolName,
): IconProps<"Feather">["name"] => {
  switch (name) {
    case "readFile":
      return "file-text";
    case "listFiles":
      return "folder";
    case "searchFiles":
      return "search";
    case "saveFile":
      return "save";
    case "editFile":
      return "edit-3";
    case "createFile":
      return "file-plus";
    case "renameFile":
      return "edit-2";
    case "deleteFile":
      return "trash-2";
    case "gitBranches":
    case "gitCheckout":
    case "gitCreateBranch":
    case "gitDeleteBranch":
      return "git-branch";
    case "gitHistory":
      return "clock";
    case "gitCommitDetails":
    case "gitStatus":
    case "gitCommit":
      return "git-commit";
    case "gitChanges":
    case "gitDiscardPreview":
      return "file-text";
    case "gitFetch":
    case "gitPull":
      return "download";
    case "gitPush":
    case "publishRepository":
      return "upload-cloud";
    case "gitStashes":
    case "gitStash":
      return "archive";
    case "gitApplyStash":
    case "gitUndo":
    case "gitRevert":
      return "rotate-ccw";
    case "gitDeleteStash":
    case "gitDiscard":
      return "trash-2";
  }
};

const formatActivityEntry = (text: string) => {
  switch (text) {
    case "Searching the web":
      return {
        label: "Search the web",
        state: "running" as const,
        icon: "search" as const,
      };
    case "Web search completed":
      return {
        label: "Search the web",
        state: "completed" as const,
        icon: "search" as const,
      };
    case "Reading a web page":
      return {
        label: "Read web page",
        state: "running" as const,
        icon: "globe" as const,
      };
    case "Page read completed":
      return {
        label: "Read web page",
        state: "completed" as const,
        icon: "globe" as const,
      };
  }
  const state = text.startsWith("Running: ")
    ? "running"
    : text.startsWith("Completed ")
      ? "completed"
      : "info";
  const label =
    state === "info" ? text : text.slice(state === "running" ? 9 : 10);
  const name = (Object.keys(workspaceTools) as WorkspaceToolName[]).find(
    (name) => formatWorkspaceAction(name) === label,
  );
  return {
    label,
    state,
    icon: name ? formatWorkspaceActionIcon(name) : ("info" as const),
  };
};

export const formatTaskActivity = (logs: readonly string[]) => {
  const rows: (ReturnType<typeof formatActivityEntry> & { id: number })[] = [];
  logs.forEach((text, id) => {
    const entry = formatActivityEntry(text);
    // Pair only the most recent pending operation, preserving subsequent repeats.
    const pending =
      entry.state === "completed"
        ? rows.findLast(
            (row) => row.state === "running" && row.label === entry.label,
          )
        : undefined;
    if (pending) pending.state = "completed";
    else rows.push({ ...entry, id });
  });
  return rows;
};

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
