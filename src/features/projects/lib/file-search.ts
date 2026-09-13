import type { ProjectFileSearchDocument, ProjectFileSearchResult, ProjectFileSearchScope } from "@/features/projects/types";

export const getProjectFileSearchScope = (title: boolean, content: boolean): ProjectFileSearchScope => {
  if (title === content) return "all";
  return title ? "title" : "content";
};

export const searchProjectFiles = (
  files: readonly ProjectFileSearchDocument[],
  query: string,
  scope: ProjectFileSearchScope,
): ProjectFileSearchResult[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  return files.flatMap((file): ProjectFileSearchResult[] => {
    const title = file.path.slice(file.path.lastIndexOf("/") + 1);
    const titleMatches = scope !== "content" && title.toLowerCase().includes(needle);
    const contentMatchCount = scope === "title" ? 0 : file.content.toLowerCase().split(needle).length - 1;
    return titleMatches || contentMatchCount > 0 ? [{ file, titleMatches, contentMatchCount }] : [];
  }).sort((left, right) => Number(right.titleMatches) - Number(left.titleMatches)
    || left.file.path.localeCompare(right.file.path));
};
