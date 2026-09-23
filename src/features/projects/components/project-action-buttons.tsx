import { type RefObject } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { Icon } from "@/components/ui/icon";
import { ProjectBranchSelect } from "@/features/projects/components/project-branch-select";
import { ProjectOtherOptions } from "@/features/projects/components/project-other-options";
import { ProjectWorkspaceGitSearch } from "@/features/projects/components/project-workspace-git-search";
import { ProjectCommitForm } from "@/features/projects/components/project-commit-form";
import { ProjectCodeTools } from "@/features/projects/components/project-code-tools";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { useProjectWorkspaceChanges } from "@/features/projects/hooks/use-project-workspace-changes";
import { formatWorkspaceTab } from "@/features/projects/lib/formatters";
import type { ProjectWorkspaceTab } from "@/features/projects/types";

type ProjectActionButtonsProps = {
  tab: Extract<ProjectWorkspaceTab, "code" | "git">;
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
          {(["files", "git"] as const).map((destination) => {
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
          <View className="min-w-0 flex-1 items-center">
            <ProjectBranchSelect
              key={projectId}
              open={branchPickerOpen}
              onOpenChange={onBranchPickerOpenChange}
            />
          </View>
          <View className="min-w-0 flex-1 items-center">
            <ProjectOtherOptions key={`other-${projectId}`} />
          </View>
        </>
      );
    default:
      throw new Error(`Unsupported workspace tab: ${tab satisfies never}`);
  }
};

type ProjectActionButtonsRightProps = ProjectActionButtonsProps & {
  branchIndicatorRef: RefObject<View | null>;
  onGitSearchOpenChange: (open: boolean) => void;
};

export const ProjectActionButtonsRight = ({
  tab,
  branchIndicatorRef,
  onGitSearchOpenChange,
}: ProjectActionButtonsRightProps) => {
  const { projectId, gitTab } = useProjectWorkspaceBranch();
  const router = useRouter();
  const { commitSelection } = useProjectWorkspaceChanges();
  const agent = formatWorkspaceTab("agent");
  switch (tab) {
    case "code":
      return (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={agent.label}
            onPress={() =>
              router.navigate({
                pathname: "/projects/[projectId]/agent",
                params: { projectId },
              })
            }
            className="h-13 min-w-11 max-w-16 flex-1 items-center justify-center rounded-full active:bg-secondary"
          >
            <Icon
              {...agent.icon}
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
          <View className="min-w-0 flex-1 items-center">
            <ProjectWorkspaceGitSearch
              branchIndicatorRef={branchIndicatorRef}
              onOpenChange={onGitSearchOpenChange}
            />
          </View>
          <View className="min-w-0 flex-1 items-center">
            <ProjectCommitForm
              key={commitSelection.scope}
              enabled={gitTab === "changes" && commitSelection.totalCount > 0}
            />
          </View>
        </>
      );
    default:
      throw new Error(`Unsupported workspace tab: ${tab satisfies never}`);
  }
};
