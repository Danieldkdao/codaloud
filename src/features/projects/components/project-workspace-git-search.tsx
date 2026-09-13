import { useCallback, type RefObject } from "react";
import type { View } from "react-native";

import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { formatWorkspaceSearch } from "@/features/projects/lib/formatters";
import { ProjectWorkspaceSearch } from "./project-workspace-search";

type ProjectWorkspaceGitSearchProps = {
  branchIndicatorRef: RefObject<View | null>;
  onOpenChange: (open: boolean) => void;
};

export const ProjectWorkspaceGitSearch = ({
  branchIndicatorRef,
  onOpenChange,
}: ProjectWorkspaceGitSearchProps) => {
  const search = formatWorkspaceSearch("git");
  const { projectId, commitSearch, setCommitSearch, setGitTab } = useProjectWorkspaceBranch();
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) setGitTab("history");
    onOpenChange(open);
  }, [setGitTab, onOpenChange]);

  return (
    <ProjectWorkspaceSearch
      key={projectId}
      anchorRef={branchIndicatorRef}
      anchorPlacement="replace"
      onOpenChange={handleOpenChange}
      value={commitSearch}
      onChangeText={setCommitSearch}
      {...search}
    />
  );
};
