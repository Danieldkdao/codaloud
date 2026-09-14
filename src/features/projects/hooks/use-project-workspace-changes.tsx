import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ProjectCommitSelection = {
  scope: string;
  selectedCount: number;
  totalCount: number;
  paths: string[];
  isReady: boolean;
  clear: () => void;
};

type ProjectWorkspaceChangesState = {
  commitSelection: ProjectCommitSelection;
  setCommitSelection: (selection: ProjectCommitSelection) => void;
};

const ProjectWorkspaceChangesContext =
  createContext<ProjectWorkspaceChangesState | null>(null);

export const ProjectWorkspaceChangesProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [commitSelection, setSelection] = useState<ProjectCommitSelection>({
    scope: "",
    selectedCount: 0,
    totalCount: 0,
    paths: [],
    isReady: false,
    clear: () => {},
  });
  const setCommitSelection = useCallback((selection: ProjectCommitSelection) => {
    setSelection((previous) =>
      previous.scope === selection.scope &&
      previous.selectedCount === selection.selectedCount &&
      previous.totalCount === selection.totalCount &&
      previous.isReady === selection.isReady &&
      previous.clear === selection.clear &&
      previous.paths.length === selection.paths.length &&
      previous.paths.every((path, index) => path === selection.paths[index])
        ? previous
        : selection,
    );
  }, []);

  return (
    <ProjectWorkspaceChangesContext
      value={{ commitSelection, setCommitSelection }}
    >
      {children}
    </ProjectWorkspaceChangesContext>
  );
};

export const useProjectWorkspaceChanges = () => {
  const changes = useContext(ProjectWorkspaceChangesContext);
  if (!changes) {
    throw new Error(
      "useProjectWorkspaceChanges must be used within ProjectWorkspaceChangesProvider",
    );
  }
  return changes;
};
