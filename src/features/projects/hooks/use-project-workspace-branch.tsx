import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";
import { useAuthSession } from "@/hooks/use-auth-session";

export type ProjectBranchSource = "local" | "remote";

type ProjectWorkspaceBranchState = {
  projectId: string;
  branch: string | null;
  branchSource: ProjectBranchSource | null;
  setBranch: (branch: string, source?: ProjectBranchSource) => void;
};

const ProjectWorkspaceBranchContext = createContext<ProjectWorkspaceBranchState | null>(null);

export const ProjectWorkspaceBranchProvider = ({ children }: { children: ReactNode }) => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const session = useAuthSession();
  const userId = !session.isPending && !session.error ? session.data?.user.id ?? null : null;
  const [selection, setSelection] = useState<{ projectId: string; userId: string; branch: string; source: ProjectBranchSource } | null>(null);
  const branch = selection?.projectId === projectId && selection.userId === userId ? selection.branch : null;

  return (
    <ProjectWorkspaceBranchContext value={{
      projectId,
      branch,
      branchSource: branch === null ? null : selection?.source ?? "local",
      // Selection is local UI state; it never checks out a Git branch.
      setBranch: (name, source = "local") => { if (userId) setSelection({ projectId, userId, branch: name, source }); },
    }}>
      {children}
    </ProjectWorkspaceBranchContext>
  );
};

export const useProjectWorkspaceBranch = () => {
  const branch = useContext(ProjectWorkspaceBranchContext);
  if (!branch) throw new Error("useProjectWorkspaceBranch must be used within ProjectWorkspaceBranchProvider");
  return branch;
};
