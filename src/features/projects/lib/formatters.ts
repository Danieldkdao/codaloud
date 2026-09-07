import type {
  ProjectSortField,
  ProjectSortOrder,
} from "@/features/projects/lib/project-params";

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
