import { type RefObject } from "react";
import { Pressable, type View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { ProjectBranchSelect } from "@/features/projects/components/project-branch-select";
import { ProjectFilesAdd } from "@/features/projects/components/project-files-add";
import { ProjectWorkspaceSearch } from "@/features/projects/components/project-workspace-search";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { demoBranches } from "@/features/projects/data/demo-commits";
import { formatWorkspaceSearch } from "@/features/projects/lib/formatters";

type ProjectActionButtonsProps = {
  tab: "files" | "code" | "git" | "agent";
};

export const ProjectActionButtonsLeft = ({ tab }: ProjectActionButtonsProps) => {
  const branchSelection = useProjectWorkspaceBranch();

  switch (tab) {
    case "files":
      return <ProjectFilesAdd />;
    case "code":
      return (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous file"
            className="size-12 items-center justify-center rounded-full active:bg-secondary">
            <Icon family="Feather" name="arrow-left" size={20} accessible={false} className="text-foreground" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next file"
            className="size-12 items-center justify-center rounded-full active:bg-secondary">
            <Icon family="Feather" name="arrow-right" size={20} accessible={false} className="text-foreground" />
          </Pressable>
        </>
      );
    case "git":
      return (
        <ProjectBranchSelect
          branch={branchSelection.branch}
          branches={demoBranches.map((branch) => branch.name)}
          onBranchChange={(name) => {
            const branch = demoBranches.find((branch) => branch.name === name);
            if (branch) branchSelection.setBranch(branch);
          }}
        />
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
  const search = formatWorkspaceSearch(tab);

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
        <ProjectWorkspaceSearch
          key={tab}
          anchorRef={branchIndicatorRef}
          anchorPlacement="replace"
          onOpenChange={onGitSearchOpenChange}
          {...search}
        />
      );
    case "files":
    case "agent":
      return <ProjectWorkspaceSearch key={tab} anchorRef={dockRef} {...search} />;
    default:
      throw new Error(`Unsupported workspace tab: ${tab satisfies never}`);
  }
};
