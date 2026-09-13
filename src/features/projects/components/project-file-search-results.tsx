import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  View,
} from "react-native";

import { ProjectIcon } from "@/components/project-icon";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import {
  formatProjectFileMatchCount,
  formatProjectFileSearchCount,
  formatProjectFileSearchCoverage,
  formatProjectFileSearchPath,
  formatProjectFileSearchTitle,
} from "@/features/projects/lib/formatters";
import type { ProjectFileSearchScope } from "@/features/projects/types";
import type { ProjectFileSearchEntrySchema } from "@/features/projects/actions/file-search-schemas";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProjectFileEntrance } from "@/features/projects/components/project-file-entrance";
import { projectFileSearchLimits } from "@/features/projects/constants";

type ProjectFileSearchResultsProps = {
  query: string;
  scope: ProjectFileSearchScope;
  results: ProjectFileSearchEntrySchema[];
  totalCount: number;
  skippedContentFiles: number;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isPaused: boolean;
  error?: string;
  onFilePress: (path: string) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onRetry?: () => void;
};

export const ProjectFileSearchResults = ({
  query,
  scope,
  results,
  totalCount,
  skippedContentFiles,
  isLoading,
  isFetching,
  isFetchingNextPage,
  isPaused,
  error,
  onFilePress,
  onLoadMore,
  onRefresh,
  onRetry,
}: ProjectFileSearchResultsProps) => {
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const insets = useSafeAreaInsets();
  const coverage = formatProjectFileSearchCoverage(scope, skippedContentFiles);
  const screenStyle = {
    paddingTop: 8,
    paddingLeft: 16 + insets.left,
    paddingRight: 16 + insets.right,
  };

  const feedback = isPaused ? (
    <PText
      className="text-center text-base text-muted-foreground"
      accessibilityLiveRegion="polite"
    >
      Reconnect to the internet to continue.
    </PText>
  ) : isLoading || isFetching ? (
    <View
      className="items-center"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityLabel={
        isLoading
          ? "Searching files"
          : isFetchingNextPage
            ? "Loading more files"
            : "Refreshing files"
      }
    >
      <ActivityIndicator className="text-primary" accessible={false} />
    </View>
  ) : error ? (
    <View className="gap-3">
      <PText
        accessibilityRole="alert"
        className="text-center text-base text-destructive"
      >
        {error}
      </PText>
      {onRetry ? (
        <Button variant="outline" onPress={onRetry}>
          Try again
        </Button>
      ) : null}
    </View>
  ) : null;

  if (results.length === 0 && feedback) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ marginBottom: dockHeight }}
      >
        {feedback}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={screenStyle}>
      <View className="gap-2 border-b border-border px-3 pb-3">
        <PText
          className="text-base font-semibold"
          accessibilityLiveRegion="polite"
        >
          {formatProjectFileSearchCount(totalCount)}
        </PText>
        {coverage.notice ? (
          <PText className="text-base text-muted-foreground" accessibilityLiveRegion="polite">
            {coverage.notice}
          </PText>
        ) : null}
      </View>
      <FlatList
        data={results}
        keyExtractor={(file) => file.path}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: dockHeight + 84 }}
        scrollIndicatorInsets={{ bottom: dockHeight }}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        onRefresh={onRefresh}
        refreshing={isFetching && !isFetchingNextPage && !isLoading}
        ListFooterComponent={
          feedback ? <View className="px-3 py-5">{feedback}</View> : null
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center gap-2 px-4 py-8">
            <Icon
              family="Feather"
              name="search"
              size={28}
              className="text-muted-foreground"
              accessible={false}
            />
            <PText className="text-center text-lg font-medium">{coverage.emptyTitle}</PText>
            <PText className="text-center text-base text-muted-foreground">
              Try another search or change the filters.
            </PText>
          </View>
        }
        renderItem={({ item, index }) => {
          const { name, directory } = formatProjectFileSearchPath(item.path);
          return (
            // Restart the stagger for each page without delaying later pages longer.
            <ProjectFileEntrance
              index={index % projectFileSearchLimits.pageSize}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.path}
                accessibilityHint="Opens file contents"
                onPress={() => {
                  Keyboard.dismiss();
                  onFilePress(item.path);
                }}
                className="flex-row items-start gap-3 border-b border-border px-3 py-4 active:bg-secondary"
              >
                <View className="pt-1">
                  <ProjectIcon name={item.path} isDirectory={false} />
                </View>
                <View className="min-w-0 flex-1 gap-1">
                  <PText
                    className="text-lg font-medium"
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {formatProjectFileSearchTitle(name, query, scope).map(
                      (part, index) =>
                        part.highlighted ? (
                          <PText
                            key={index}
                            className="text-lg font-medium bg-primary/75 text-primary-foreground"
                          >
                            {part.text}
                          </PText>
                        ) : (
                          part.text
                        ),
                    )}
                  </PText>
                  <PText
                    className="text-base text-muted-foreground"
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {directory}
                  </PText>
                  {item.contentMatchCount > 0 && (
                    <PText className="text-base text-muted-foreground">
                      {formatProjectFileMatchCount(item.contentMatchCount)}
                    </PText>
                  )}
                </View>
              </Pressable>
            </ProjectFileEntrance>
          );
        }}
      />
    </View>
  );
};
