import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { formatCommitHash } from "@/features/projects/lib/formatters";
import type { GitHubRepositoryBranch } from "@/services/github/types";

export type GitHubRepositoryBranchItemProps = {
  branch: Pick<GitHubRepositoryBranch, "name"> & Partial<Pick<GitHubRepositoryBranch, "commitSha" | "protected">>;
  selected?: boolean;
  onPress: () => void;
};

export const GitHubRepositoryBranchItem = ({
  branch,
  selected = false,
  onPress,
}: GitHubRepositoryBranchItemProps) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={branch.name}
    accessibilityHint={selected ? "Clear selection and show all branches" : "Select this branch"}
    accessibilityState={{ selected }}
    className="flex-row items-start gap-3 px-4 py-3 active:opacity-80"
  >
    <Icon
      family="Feather"
      name="git-branch"
      size={20}
      className="text-foreground mt-0.5"
      accessible={false}
    />
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <PText
          numberOfLines={1}
          ellipsizeMode="tail"
          className="min-w-0 flex-1 font-medium text-foreground"
        >
          {branch.name}
        </PText>
        {branch.protected && (
          <Icon
            family="Feather"
            name="lock"
            size={16}
            className="text-muted-foreground"
            accessible
            accessibilityRole="image"
            accessibilityLabel="Protected branch"
          />
        )}
      </View>
      <View className="flex-row items-center gap-2">
        <Icon
          family="Feather"
          name="git-commit"
          size={16}
          className="text-muted-foreground"
          accessible={false}
        />
        <PText numberOfLines={1} className="text-muted-foreground">
          {branch.commitSha ? formatCommitHash(branch.commitSha) : "Unknown"}
        </PText>
      </View>
    </View>
  </Pressable>
);
