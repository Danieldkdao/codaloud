import type { ProjectAgentActivityKind, ProjectAgentActivityStatus } from "@/features/projects/types";
import type { ProjectSetupStatus } from "@/db/shared";
import type { CreateProjectSchema } from "@/features/projects/actions/schemas";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";
import type {
  ProjectSortField,
  ProjectSortOrder,
} from "@/features/projects/lib/project-params";

export const formatProjectFileKind = (kind: ProjectFileKind) => {
  switch (kind) {
    case "file":
      return { inputLabel: "File name", placeholder: "new-file.ts", successMessage: "File created" };
    case "folder":
      return { inputLabel: "Folder name", placeholder: "new-folder", successMessage: "Folder created" };
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


export const formatWorkspaceSearch = (tab: string | undefined) => {
  switch (tab) {
    case "git":
      return { placeholder: "Search Commits", accessibilityLabel: "Search commits" };
    case "agent":
      return { placeholder: "Search Activity", accessibilityLabel: "Search activity" };
    default:
      return { placeholder: "Search Files", accessibilityLabel: "Search files" };
  }
};
