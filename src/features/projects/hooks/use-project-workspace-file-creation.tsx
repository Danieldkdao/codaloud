import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";

type ProjectWorkspaceFileCreationState = {
  kind: ProjectFileKind | null;
  /** True while a file or folder name is being typed, created, or renamed. */
  naming: boolean;
  begin: (kind: ProjectFileKind) => void;
  finish: () => void;
  beginNaming: () => void;
  endNaming: () => void;
};

const ProjectWorkspaceFileCreationContext =
  createContext<ProjectWorkspaceFileCreationState | null>(null);

export const ProjectWorkspaceFileCreationProvider = ({
  children,
  projectId,
}: {
  children: ReactNode;
  projectId: string;
}) => {
  const [creation, setCreation] = useState<{
    projectId: string;
    kind: ProjectFileKind;
  } | null>(null);
  // Rows can overlap: a rename in one list item beside a create row elsewhere.
  // A count is the only way to clear the flag once the last one unmounts.
  const [namingCount, setNamingCount] = useState(0);
  const own = (current: typeof creation) =>
    current?.projectId === projectId ? current : null;

  return (
    <ProjectWorkspaceFileCreationContext
      value={{
        kind: own(creation)?.kind ?? null,
        naming: namingCount > 0,
        begin: (kind) =>
          setCreation((current) =>
            own(current) ? current : { projectId, kind },
          ),
        // A previous project's request must not close the current project's form.
        finish: () => setCreation((current) => (own(current) ? null : current)),
        beginNaming: () => setNamingCount((count) => count + 1),
        endNaming: () => setNamingCount((count) => Math.max(0, count - 1)),
      }}
    >
      {children}
    </ProjectWorkspaceFileCreationContext>
  );
};

export const useProjectWorkspaceFileCreation = () => {
  const creation = useContext(ProjectWorkspaceFileCreationContext);
  if (!creation)
    throw new Error(
      "useProjectWorkspaceFileCreation must be used within ProjectWorkspaceFileCreationProvider",
    );
  return creation;
};
