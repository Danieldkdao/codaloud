import { type RefObject } from "react";
import { Pressable, type View } from "react-native";
import { useRouter } from "expo-router";

import { Icon } from "@/components/ui/icon";
import { ProjectBranchSelect } from "@/features/projects/components/project-branch-select";
import { ProjectOtherOptions } from "@/features/projects/components/project-other-options";
import { ProjectWorkspaceSearch } from "@/features/projects/components/project-workspace-search";
import { ProjectWorkspaceGitSearch } from "@/features/projects/components/project-workspace-git-search";
import { ProjectCommitForm } from "@/features/projects/components/project-commit-form";
import { ProjectCodeTools } from "@/features/projects/components/project-code-tools";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { useProjectWorkspaceChanges } from "@/features/projects/hooks/use-project-workspace-changes";
import {
  formatWorkspaceSearch,
  formatWorkspaceTab,
} from "@/features/projects/lib/formatters";
import type { ProjectWorkspaceTab } from "@/features/projects/types";

type ProjectActionButtonsProps = {
  tab: Exclude<ProjectWorkspaceTab, "files">;
  branchPickerOpen?: boolean;
  onBranchPickerOpenChange?: (open: boolean) => void;
};

export const ProjectActionButtonsLeft = ({
  tab,
  branchPickerOpen,
  onBranchPickerOpenChange,
}: ProjectActionButtonsProps) => {
  const { projectId } = useProjectWorkspaceBranch();
  const router = useRouter();

  switch (tab) {
    case "code":
      return (
        <>
          {(["files", "git", "agent"] as const).map((destination) => {
            const presentation = formatWorkspaceTab(destination);
            return (
              <Pressable
                key={destination}
                accessibilityRole="button"
                accessibilityLabel={presentation.label}
                onPress={() =>
                  router.navigate({
                    pathname: `/projects/[projectId]/${destination}`,
                    params: { projectId },
                  })
                }
                className="h-13 min-w-11 max-w-16 flex-1 items-center justify-center rounded-full active:bg-secondary"
              >
                <Icon
                  {...presentation.icon}
                  size={22}
                  accessible={false}
                  className="text-foreground"
                />
              </Pressable>
            );
          })}
        </>
      );
    case "git":
      return (
        <>
          <ProjectBranchSelect
            key={projectId}
            open={branchPickerOpen}
            onOpenChange={onBranchPickerOpenChange}
          />
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            className="h-13 min-w-11 max-w-16 flex-1 items-center justify-center rounded-full active:bg-secondary"
          >
            <Icon
              family="Feather"
              name="corner-up-left"
              size={22}
              accessible={false}
              className="text-foreground"
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Redo"
            className="h-13 min-w-11 max-w-16 flex-1 items-center justify-center rounded-full active:bg-secondary"
          >
            <Icon
              family="Feather"
              name="corner-up-right"
              size={22}
              accessible={false}
              className="text-foreground"
            />
          </Pressable>
          <ProjectCodeTools key={projectId} />
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
    case "agent":
      return (
        <ProjectWorkspaceSearch
          key={tab}
          anchorRef={dockRef}
          {...formatWorkspaceSearch(tab)}
        />
      );
    default:
      throw new Error(`Unsupported workspace tab: ${tab satisfies never}`);
  }
};
