import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ProjectOpenFilesState } from "../types";
import {
  openWorkspaceFile,
  removeWorkspaceFiles,
  renameWorkspaceFiles,
} from "../lib/workspace-files";
import { isProjectFilePathWithin } from "../lib/files";
import { loadOpenTabs, saveOpenTabs } from "../lib/open-tabs-storage";

type ProjectWorkspaceCurrentFileState = {
  openFilePaths: ReadonlySet<string>;
  activeFilePath: string | null;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  renameFiles: (previousPath: string, nextPath: string) => void;
  removeFiles: (path: string) => void;
  getFileVersion: (path: string) => number;
  refreshFile: (path: string) => void;
  refreshFiles: () => void;
};

const ProjectWorkspaceCurrentFileContext =
  createContext<ProjectWorkspaceCurrentFileState | null>(null);

const WorkspaceFiles = ({
  children,
  projectId,
}: {
  children: ReactNode;
  projectId: string;
}) => {
  const [state, setState] = useState<ProjectOpenFilesState>(() =>
    loadOpenTabs(projectId),
  );
  useEffect(
    () => saveOpenTabs(projectId, state),
    [projectId, state.openFilePaths, state.activeFilePath],
  );
  const refresh = (paths?: string[]) =>
    setState((current) => {
      const versions = new Map(current.versions);
      for (const path of paths ?? current.openFilePaths) {
        versions.set(path, (versions.get(path) ?? 0) + 1);
      }
      return { ...current, versions };
    });
  return (
    <ProjectWorkspaceCurrentFileContext
      value={{
        openFilePaths: state.openFilePaths,
        activeFilePath: state.activeFilePath,
        openFile: (path) =>
          setState((current) => openWorkspaceFile(current, path)),
        closeFile: (path) =>
          setState((current) => removeWorkspaceFiles(current, [path])),
        renameFiles: (previous, next) =>
          setState((current) => renameWorkspaceFiles(current, previous, next)),
        removeFiles: (root) =>
          setState((current) =>
            removeWorkspaceFiles(
              current,
              [...current.openFilePaths].filter((path) =>
                isProjectFilePathWithin(path, root),
              ),
            ),
          ),
        getFileVersion: (path) => state.versions.get(path) ?? 0,
        refreshFile: (path) => refresh([path]),
        refreshFiles: () => refresh(),
      }}
    >
      {children}
    </ProjectWorkspaceCurrentFileContext>
  );
};

export const ProjectWorkspaceCurrentFileProvider = ({
  children,
  projectId,
}: {
  children: ReactNode;
  projectId: string;
}) => (
  // This provider sits above every workspace section. A different project gets
  // a fresh owner, so late callbacks from the previous project cannot edit it.
  <WorkspaceFiles key={projectId} projectId={projectId}>
    {children}
  </WorkspaceFiles>
);

export const useProjectWorkspaceCurrentFile = () => {
  const files = useContext(ProjectWorkspaceCurrentFileContext);
  if (!files)
    throw new Error(
      "useProjectWorkspaceCurrentFile must be used within ProjectWorkspaceCurrentFileProvider",
    );
  return files;
};
