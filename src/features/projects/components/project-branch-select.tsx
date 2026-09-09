import { use } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { CodeText, PText } from "@/components/ui/text";
import { ProjectWorkspaceDockHeightContext } from "@/features/projects/contexts/project-workspace-context";
import { formatCommitHash } from "@/features/projects/lib/formatters";
import type { ProjectBranchData } from "@/features/projects/types";

type ProjectBranchSelectProps = {
  branch: ProjectBranchData;
  branches: string[];
  onBranchChange: (name: string) => void;
};

export const ProjectBranchSelect = ({ branch, branches, onBranchChange }: ProjectBranchSelectProps) => {
  const dockHeight = use(ProjectWorkspaceDockHeightContext);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const availableWidth = width - insets.left - insets.right - 32;
  // Match the search button's 440-point floating area and reserve its 56-point target.
  const left = 16 + insets.left + Math.max(0, (availableWidth - 440) / 2);
  const buttonWidth = Math.min(240, availableWidth - 68);
  const tip = branch.commits[0];

  return (
    <View style={{ position: "absolute", left, bottom: dockHeight + 4 }}>
      <GlassSurface>
        <NativeSelect
          label="Branch"
          trigger={
            <View className="flex-row items-center gap-3 px-4" style={{ width: buttonWidth, height: 56 }}>
              <Icon family="Feather" name="git-branch" size={22} className="text-primary" accessible={false} />
              <View className="min-w-0 flex-1">
                <PText className="font-medium text-foreground" numberOfLines={1} ellipsizeMode="middle">
                  {branch.name}
                </PText>
                <CodeText className="text-muted-foreground" numberOfLines={1}>
                  {tip ? formatCommitHash(tip.hash) : "No commits"}
                </CodeText>
              </View>
              <Icon family="Feather" name="chevron-down" size={16} className="text-muted-foreground" accessible={false} />
            </View>
          }
          sections={[{
            label: "Branches",
            value: branch.name,
            options: branches.map((name) => ({
              value: name,
              label: name,
              onSelect: () => onBranchChange(name),
            })),
          }]}
        />
      </GlassSurface>
    </View>
  );
};
