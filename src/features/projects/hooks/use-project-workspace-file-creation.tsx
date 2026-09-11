import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";

type ProjectWorkspaceFileCreationState = {
  kind: ProjectFileKind | null;
  begin: (kind: ProjectFileKind) => void;
  finish: () => void;
};

const ProjectWorkspaceFileCreationContext = createContext<ProjectWorkspaceFileCreationState | null>(null);

export const ProjectWorkspaceFileCreationProvider = ({ children, projectId }: {
  children: ReactNode;
  projectId: string;
}) => {
  const [creation, setCreation] = useState<{ projectId: string; kind: ProjectFileKind } | null>(null);

  return (
    <ProjectWorkspaceFileCreationContext value={{
      kind: creation?.projectId === projectId ? creation.kind : null,
      begin: (kind) => setCreation((current) => current?.projectId === projectId ? current : { projectId, kind }),
      // A previous project's request must not close the current project's form.
      finish: () => setCreation((current) => current?.projectId === projectId ? null : current),
    }}>
      {children}
    </ProjectWorkspaceFileCreationContext>
  );
};

export const useProjectWorkspaceFileCreation = () => {
  const creation = useContext(ProjectWorkspaceFileCreationContext);
  if (!creation) throw new Error("useProjectWorkspaceFileCreation must be used within ProjectWorkspaceFileCreationProvider");
  return creation;
};
