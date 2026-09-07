import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import type { GitHubRepository } from "@/services/github/types";

export type GitHubRepositorySelectItemProps = {
  repository: GitHubRepository;
  selected?: boolean;
  onPress: () => void;
};

export const GitHubRepositorySelectItem = ({
  repository,
  selected = false,
  onPress,
}: GitHubRepositorySelectItemProps) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`${repository.fullName}, ${repository.private ? "Private repository" : "Public repository"}`}
    accessibilityHint={selected ? "Clear selection and show all repositories" : "Select this repository"}
    accessibilityState={{ selected }}
    className="flex-row items-start gap-3 px-4 py-3 active:opacity-80 focus-visible:outline-2 focus-visible:outline-ring"
  >
    <Icon
      family="FontAwesome"
      name="github"
      size={24}
      className="text-foreground"
      accessible={false}
    />
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <PText
          numberOfLines={1}
          ellipsizeMode="tail"
          className="min-w-0 flex-1 font-medium text-foreground"
        >
          {repository.fullName}
        </PText>
        <Icon
          family="Feather"
          name={repository.private ? "lock" : "globe"}
          size={16}
          className="text-muted-foreground"
          accessible
          accessibilityRole="image"
          accessibilityLabel={repository.private ? "Private repository" : "Public repository"}
        />
      </View>
      {repository.description && (
        <PText
          numberOfLines={1}
          ellipsizeMode="tail"
          className="text-muted-foreground"
        >
          {repository.description}
        </PText>
      )}
    </View>
  </Pressable>
);
