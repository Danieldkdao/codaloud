import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

type ProjectWorkspaceCurrentFileState = {
  filePath: string | null;
  version: number;
  setFilePath: Dispatch<SetStateAction<string | null>>;
  refreshFile: (path: string) => void;
};

const ProjectWorkspaceCurrentFileContext = createContext<ProjectWorkspaceCurrentFileState | null>(null);

export const ProjectWorkspaceCurrentFileProvider = ({ children, projectId }: {
  children: ReactNode;
  projectId: string;
}) => {
  const [currentFile, setCurrentFile] = useState<{ projectId: string; path: string; version: number } | null>(null);
  const setFilePath: ProjectWorkspaceCurrentFileState["setFilePath"] = (nextPath) => setCurrentFile((current) => {
    // A mutation can finish after navigation. Apply its updater only to
    // this project's latest selection, never a newer project's file.
    if (typeof nextPath === "function" && current?.projectId !== projectId) return current;
    const path = typeof nextPath === "function" ? nextPath(current?.path ?? null) : nextPath;
    return path === null ? null : { projectId, path, version: current?.version ?? 0 };
  });

  return (
    <ProjectWorkspaceCurrentFileContext value={{
      filePath: currentFile?.projectId === projectId ? currentFile.path : null,
      version: currentFile?.projectId === projectId ? currentFile.version : 0,
      setFilePath,
      // Recreating a selected path opens a new document, even if its name is unchanged.
      refreshFile: (path) => setCurrentFile((current) =>
        current?.projectId === projectId && current.path === path
          ? { ...current, version: current.version + 1 }
          : current),
    }}>
      {children}
    </ProjectWorkspaceCurrentFileContext>
  );
};

export const useProjectWorkspaceCurrentFile = () => {
  const currentFile = useContext(ProjectWorkspaceCurrentFileContext);
  if (!currentFile) throw new Error("useProjectWorkspaceCurrentFile must be used within ProjectWorkspaceCurrentFileProvider");
  return currentFile;
};
