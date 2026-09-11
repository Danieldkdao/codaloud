import { createContext } from "react";
import type { ProjectBranchData } from "@/features/projects/types";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";

export const ProjectWorkspaceFileCreationContext = createContext<{
  kind: ProjectFileKind | null;
  begin: (kind: ProjectFileKind) => void;
  finish: () => void;
} | null>(null);

// Includes both floating surfaces and their bottom safe-area spacing.
export const ProjectWorkspaceDockHeightContext = createContext(0);

export const ProjectWorkspaceBranchContext = createContext<{
  branch: ProjectBranchData;
  setBranch: (branch: ProjectBranchData) => void;
} | null>(null);

export const ProjectWorkspaceCurrentFileContext = createContext<{
  filePath: string | null;
  setFilePath: (filePath: string | null) => void;
} | null>(null);
