import type { ProjectSetupStatus } from "@/db/shared";
import type { CreateProjectSchema } from "@/features/projects/actions/schemas";
import type {
  ProjectSortField,
  ProjectSortOrder,
} from "@/features/projects/lib/project-params";

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
