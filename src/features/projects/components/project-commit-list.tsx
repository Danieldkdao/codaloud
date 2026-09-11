import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { CodeText, HeadingText, PText } from "@/components/ui/text";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import {
  formatCommitDate,
  formatCommitHash,
} from "@/features/projects/lib/formatters";
import type { ProjectCommitData } from "@/features/projects/types";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";

type ProjectCommitListProps = {
  commits: ProjectCommitData[];
};

export const ProjectCommitList = ({ commits }: ProjectCommitListProps) => {
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const insets = useSafeAreaInsets();

  if (commits.length === 0) {
    return (
      <View className="flex-1">
        <ProjectWorkspaceState
          icon="git-commit"
          title="No commits yet"
          description="Your commits will appear here once you save changes to Git."
        />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={commits}
      keyExtractor={(commit) => commit.hash}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: 16,
        paddingLeft: 20 + insets.left,
        paddingRight: 20 + insets.right,
        paddingBottom: dockHeight + 24,
      }}
      scrollIndicatorInsets={{ bottom: dockHeight }}
      ListHeaderComponent={
        <View className="pb-6">
          <HeadingText
            accessibilityRole="header"
            className="text-2xl"
          >
            Commit history
          </HeadingText>
        </View>
      }
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() => {}}
          accessibilityRole="button"
          accessibilityLabel={`${item.message}, ${item.author}, ${formatCommitDate(item.committedAt)}, ${formatCommitHash(item.hash)}`}
          className="flex-row gap-3 rounded-xl active:bg-secondary"
          style={{ minHeight: 104 }}
        >
          <View
            className="w-8 items-center pt-3"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <View className="h-7 w-8 items-center justify-center rounded-full bg-background">
              <Icon
                family="Feather"
                name={item.isMerge ? "git-merge" : "git-commit"}
                size={22}
                className="text-primary"
              />
            </View>
            {index < commits.length - 1 ? (
              <View className="w-px flex-1 bg-primary/20" />
            ) : null}
          </View>
          <View className="min-w-0 flex-1 flex-row items-center gap-3 first:border-t last:border-b-0 border-b border-border py-3">
            <View className="min-w-0 flex-1 gap-2">
              <PText
                className="min-w-0 font-medium text-foreground text-lg"
                numberOfLines={2}
              >
                {item.message}
              </PText>
              <View className="flex-row flex-wrap items-center gap-2">
                <CodeText className="text-muted-foreground font-medium">
                  {formatCommitHash(item.hash)}
                </CodeText>
                {item.refs?.map((ref) => (
                  <View
                    key={ref}
                    className="rounded-md bg-secondary px-2 py-0.5"
                  >
                    <PText className="text-primary">{ref}</PText>
                  </View>
                ))}
              </View>
              <View className="flex-row items-center gap-2">
                <View className="flex-row items-center gap-2">
                  <Icon
                    family="Feather"
                    name="user"
                    size={14}
                    className="text-muted-foreground"
                    accessible={false}
                  />
                  <PText
                    className="min-w-0"
                    numberOfLines={1}
                  >
                    {item.author}
                  </PText>
                </View>
                <Icon
                  family="Octicons"
                  name="dot-fill"
                  size={6}
                  className="text-muted-foreground"
                  accessible={false}
                />
                <PText>
                  {formatCommitDate(item.committedAt)}
                </PText>
              </View>
            </View>
            <Icon
              family="Feather"
              name="arrow-right"
              size={20}
              className="text-muted-foreground/45"
              accessible={false}
            />
          </View>
        </Pressable>
      )}
    />
  );
};
