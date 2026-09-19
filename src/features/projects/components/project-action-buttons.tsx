import { type RefObject } from "react";
import { Pressable, type View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { ProjectBranchSelect } from "@/features/projects/components/project-branch-select";
import { ProjectOtherOptions } from "@/features/projects/components/project-other-options";
import { ProjectFilesAdd } from "@/features/projects/components/project-files-add";
import { ProjectWorkspaceSearch } from "@/features/projects/components/project-workspace-search";
import { ProjectWorkspaceFileSearch } from "@/features/projects/components/project-workspace-file-search";
import { ProjectWorkspaceGitSearch } from "@/features/projects/components/project-workspace-git-search";
import { ProjectCommitForm } from "@/features/projects/components/project-commit-form";
import { ProjectCodeTools } from "@/features/projects/components/project-code-tools";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { useProjectWorkspaceChanges } from "@/features/projects/hooks/use-project-workspace-changes";
import { formatWorkspaceSearch } from "@/features/projects/lib/formatters";
import type { ProjectWorkspaceTab } from "@/features/projects/types";

type ProjectActionButtonsProps = {
  tab: ProjectWorkspaceTab;
  branchPickerOpen?: boolean;
  onBranchPickerOpenChange?: (open: boolean) => void;
};

export const ProjectActionButtonsLeft = ({ tab, branchPickerOpen, onBranchPickerOpenChange }: ProjectActionButtonsProps) => {
  const { projectId } = useProjectWorkspaceBranch();
  const { activeFilePath } = useProjectWorkspaceCurrentFile();

  switch (tab) {
    case "files":
      return <ProjectFilesAdd />;
    case "code":
      return (
        <>
          <ProjectCodeTools key={projectId} path={activeFilePath} />
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityLabel="Git tools"
            accessibilityHint="Coming soon."
            accessibilityState={{ disabled: true }}
            className="size-12 items-center justify-center rounded-full"
          >
            <Icon family="MaterialCommunityIcons" name="git" size={20} accessible={false} className="text-foreground" />
          </Pressable>
        </>
      );
    case "git":
      return (
        <>
          <ProjectBranchSelect key={projectId} open={branchPickerOpen} onOpenChange={onBranchPickerOpenChange} />
          <ProjectOtherOptions key={`other-${projectId}`} />
        </>
      );
    case "agent":
      return null;
    default:
      throw new Error(`Unsupported workspace tab: ${tab satisfies never}`);
  }
};

type ProjectActionButtonsRightProps = ProjectActionButtonsProps & {
  dockRef: RefObject<View | null>;
  branchIndicatorRef: RefObject<View | null>;
  onGitSearchOpenChange: (open: boolean) => void;
};

export const ProjectActionButtonsRight = ({
  tab,
  dockRef,
  branchIndicatorRef,
  onGitSearchOpenChange,
}: ProjectActionButtonsRightProps) => {
  const { projectId, gitTab } = useProjectWorkspaceBranch();
  const { commitSelection } = useProjectWorkspaceChanges();
  switch (tab) {
    case "code":
      return (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo"
            className="size-12 items-center justify-center rounded-full active:bg-secondary">
            <Icon family="Feather" name="corner-up-left" size={20} accessible={false} className="text-foreground" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Redo"
            className="size-12 items-center justify-center rounded-full active:bg-secondary">
            <Icon family="Feather" name="corner-up-right" size={20} accessible={false} className="text-foreground" />
          </Pressable>
        </>
      );
    case "git":
      return (
        <>
          <ProjectWorkspaceGitSearch
            branchIndicatorRef={branchIndicatorRef}
            onOpenChange={onGitSearchOpenChange}
          />
          <ProjectCommitForm
            key={commitSelection.scope}
            enabled={gitTab === "changes" && commitSelection.totalCount > 0}
          />
        </>
      );
    case "files":
      return <ProjectWorkspaceFileSearch key={projectId} anchorRef={dockRef} />;
    case "agent":
      return <ProjectWorkspaceSearch key={tab} anchorRef={dockRef} {...formatWorkspaceSearch(tab)} />;
    default:
      throw new Error(`Unsupported workspace tab: ${tab satisfies never}`);
  }
};
