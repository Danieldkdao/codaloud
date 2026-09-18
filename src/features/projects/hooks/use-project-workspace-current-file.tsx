import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ProjectOpenFilesState } from "../types";
import { openWorkspaceFile, removeWorkspaceFiles, renameWorkspaceFiles } from "../lib/workspace-files";
import { isProjectFilePathWithin } from "../lib/files";

type ProjectWorkspaceCurrentFileState = {
  openFilePaths: string[];
  activeFilePath: string | null;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  renameFiles: (previousPath: string, nextPath: string) => void;
  removeFiles: (path: string) => void;
  getFileVersion: (path: string) => number;
  refreshFile: (path: string) => void;
  refreshFiles: () => void;
  // Existing single-file consumers are migrated in the next integration chunk.
  filePath: string | null;
  version: number;
  setFilePath: Dispatch<SetStateAction<string | null>>;
};

const ProjectWorkspaceCurrentFileContext = createContext<ProjectWorkspaceCurrentFileState | null>(null);

const WorkspaceFiles = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ProjectOpenFilesState>({ openFilePaths: [], activeFilePath: null, versions: {} });
  const refresh = (paths: string[]) => setState((current) => ({
    ...current,
    versions: { ...current.versions, ...Object.fromEntries(paths.map((path) => [path, (current.versions[path] ?? 0) + 1])) },
  }));
  return (
    <ProjectWorkspaceCurrentFileContext value={{
      openFilePaths: state.openFilePaths,
      activeFilePath: state.activeFilePath,
      openFile: (path) => setState((current) => openWorkspaceFile(current, path)),
      closeFile: (path) => setState((current) => removeWorkspaceFiles(current, [path])),
      renameFiles: (previous, next) => setState((current) => renameWorkspaceFiles(current, previous, next)),
      removeFiles: (root) => setState((current) => removeWorkspaceFiles(current, current.openFilePaths.filter((path) => isProjectFilePathWithin(path, root)))),
      getFileVersion: (path) => state.versions[path] ?? 0,
      refreshFile: (path) => refresh([path]),
      refreshFiles: () => setState((current) => ({ ...current, versions: { ...current.versions, ...Object.fromEntries(current.openFilePaths.map((path) => [path, (current.versions[path] ?? 0) + 1])) } })),
      filePath: state.activeFilePath,
      version: state.activeFilePath ? state.versions[state.activeFilePath] ?? 0 : 0,
      setFilePath: (next) => setState((current) => {
        const path = typeof next === "function" ? next(current.activeFilePath) : next;
        return path === null
          ? removeWorkspaceFiles(current, current.activeFilePath ? [current.activeFilePath] : [])
          : openWorkspaceFile(current, path);
      }),
    }}>
      {children}
    </ProjectWorkspaceCurrentFileContext>
  );
};

export const ProjectWorkspaceCurrentFileProvider = ({ children, projectId }: { children: ReactNode; projectId: string }) => (
  // This provider sits above every workspace section. A different project gets
  // a fresh owner, so late callbacks from the previous project cannot edit it.
  <WorkspaceFiles key={projectId}>{children}</WorkspaceFiles>
);

export const useProjectWorkspaceCurrentFile = () => {
  const files = useContext(ProjectWorkspaceCurrentFileContext);
  if (!files) throw new Error("useProjectWorkspaceCurrentFile must be used within ProjectWorkspaceCurrentFileProvider");
  return files;
};
