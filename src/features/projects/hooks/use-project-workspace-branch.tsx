import { createContext, useContext, useState, type ReactNode } from "react";
import { demoBranches } from "@/features/projects/data/demo-commits";
import type { ProjectBranchData } from "@/features/projects/types";

type ProjectWorkspaceBranchState = {
  branch: ProjectBranchData;
  setBranch: (branch: ProjectBranchData) => void;
};

const ProjectWorkspaceBranchContext = createContext<ProjectWorkspaceBranchState | null>(null);

export const ProjectWorkspaceBranchProvider = ({ children }: { children: ReactNode }) => {
  const [branch, setBranch] = useState(demoBranches[0]);

  return (
    <ProjectWorkspaceBranchContext value={{ branch, setBranch }}>
      {children}
    </ProjectWorkspaceBranchContext>
  );
};

export const useProjectWorkspaceBranch = () => {
  const branch = useContext(ProjectWorkspaceBranchContext);
  if (!branch) throw new Error("useProjectWorkspaceBranch must be used within ProjectWorkspaceBranchProvider");
  return branch;
};
