import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { mockProjectSearchFiles } from "@/features/projects/data/mock-file-search";
import { getProjectFileSearchScope, searchProjectFiles } from "@/features/projects/lib/file-search";
import type { ProjectFileSearchResult, ProjectFileSearchScope } from "@/features/projects/types";

type ProjectWorkspaceFileSearchState = {
  query: string;
  setQuery: (query: string) => void;
  title: boolean;
  setTitle: (title: boolean) => void;
  content: boolean;
  setContent: (content: boolean) => void;
  scope: ProjectFileSearchScope;
  isSearching: boolean;
  results: ProjectFileSearchResult[];
};

const ProjectWorkspaceFileSearchContext = createContext<ProjectWorkspaceFileSearchState | null>(null);

// Mounted with the project key so navigation cannot carry another project's search across.
export const ProjectWorkspaceFileSearchProvider = ({ children }: { children: ReactNode }) => {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState(false);
  const [content, setContent] = useState(false);
  const scope = getProjectFileSearchScope(title, content);
  const results = useMemo(() => searchProjectFiles(mockProjectSearchFiles, query, scope), [query, scope]);

  return (
    <ProjectWorkspaceFileSearchContext value={{ query, setQuery, title, setTitle, content, setContent,
      scope, isSearching: query.trim().length > 0, results }}>
      {children}
    </ProjectWorkspaceFileSearchContext>
  );
};

export const useProjectWorkspaceFileSearch = () => {
  const search = use(ProjectWorkspaceFileSearchContext);
  if (!search) throw new Error("useProjectWorkspaceFileSearch must be used within ProjectWorkspaceFileSearchProvider");
  return search;
};
