import { createContext } from "react";
import type { ProjectBranchData } from "@/features/projects/types";

// Includes both floating surfaces and their bottom safe-area spacing.
export const ProjectWorkspaceDockHeightContext = createContext(0);

export const ProjectWorkspaceBranchContext = createContext<{
  branch: ProjectBranchData;
  setBranch: (branch: ProjectBranchData) => void;
} | null>(null);
