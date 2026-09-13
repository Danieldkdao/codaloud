import { useDebouncer } from "@tanstack/react-pacer";
import {
  createContext,
  use,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { getProjectFileSearchScope } from "@/features/projects/lib/file-search";
import type { ProjectFileSearchScope } from "@/features/projects/types";

type ProjectWorkspaceFileSearchState = {
  query: string;
  setQuery: (query: string) => void;
  debouncedQuery: string;
  title: boolean;
  setTitle: (title: boolean) => void;
  content: boolean;
  setContent: (content: boolean) => void;
  scope: ProjectFileSearchScope;
  isSearching: boolean;
};

const ProjectWorkspaceFileSearchContext =
  createContext<ProjectWorkspaceFileSearchState | null>(null);

// Mounted with the project key so navigation cannot carry another project's search across.
export const ProjectWorkspaceFileSearchProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [query, setDraftQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Keep the pending search with the workspace when its floating input unmounts.
  const { maybeExecute, cancel } = useDebouncer(setDebouncedQuery, {
    wait: 1000,
  });
  const setQuery = useCallback(
    (value: string) => {
      setDraftQuery(value);
      if (value.trim().length === 0) {
        cancel();
        setDebouncedQuery(value);
      } else {
        maybeExecute(value);
      }
    },
    [maybeExecute, cancel],
  );
  const [title, setTitle] = useState(false);
  const [content, setContent] = useState(false);
  const scope = getProjectFileSearchScope(title, content);

  return (
    <ProjectWorkspaceFileSearchContext
      value={{
        query,
        setQuery,
        debouncedQuery,
        title,
        setTitle,
        content,
        setContent,
        scope,
        isSearching: query.trim().length > 0,
      }}
    >
      {children}
    </ProjectWorkspaceFileSearchContext>
  );
};

export const useProjectWorkspaceFileSearch = () => {
  const search = use(ProjectWorkspaceFileSearchContext);
  if (!search)
    throw new Error(
      "useProjectWorkspaceFileSearch must be used within ProjectWorkspaceFileSearchProvider",
    );
  return search;
};
