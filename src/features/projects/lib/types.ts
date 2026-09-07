import type { ProjectSelectData } from "@/db/schemas/project";

// The API serializes database timestamps as ISO strings.
export type ProjectResponseData = Omit<
  ProjectSelectData,
  "createdAt" | "updatedAt" | "lastOpenedAt"
> & {
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};
