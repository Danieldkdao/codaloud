import { useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";

import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import type { GitHubRepository } from "@/features/projects/types";
import { cn } from "@/lib/utils";
import { useGitHubRepositories } from "@/services/github/hooks/use-github-repositories";

export type GitHubRepositoriesListProps = {
  className?: string;
};

export const GitHubRepositoriesList = ({
  className,
}: GitHubRepositoriesListProps) => {
  const [search, setSearch] = useState("");
  const {
    data,
    isPending,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchStatus,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useGitHubRepositories({ search });
  const repositories = data?.pages.flat() ?? [];

  const loadMore = () => {
    if (hasNextPage && !isFetching && !error) {
      void fetchNextPage({ cancelRefetch: false });
    }
  };

  const retry = () => {
    if (isFetching) return;
    if (isFetchNextPageError) {
      void fetchNextPage({ cancelRefetch: false });
    } else {
      void refetch();
    }
  };

  return (
    <View
      className={cn(
        "max-h-80 min-h-24 shrink overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <View className="p-3">
        <SearchInput
          initialSearch={search}
          onValueChange={setSearch}
          placeholder="Search repositories"
        />
      </View>
      <FlatList<GitHubRepository>
        key={search.trim().toLowerCase()}
        className="min-h-24 shrink overflow-hidden"
        accessibilityLabel="GitHub repositories"
        data={repositories}
        keyExtractor={(repository) => String(repository.id)}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <View className="flex-row items-start gap-3 px-4 py-3">
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
                  {item.fullName}
                </PText>
                <Icon
                  family="Feather"
                  name={item.private ? "lock" : "globe"}
                  size={16}
                  className="text-muted-foreground"
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={item.private ? "Private repository" : "Public repository"}
                />
              </View>
              {item.description && (
                <PText
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  className="text-muted-foreground"
                >
                  {item.description}
                </PText>
              )}
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-border" />}
        ListEmptyComponent={
          !error && fetchStatus !== "paused" ? (
            <View className="items-center gap-2 p-4">
              {isPending && <ActivityIndicator className="text-foreground" />}
              <PText
                accessibilityLiveRegion="polite"
                className="text-muted-foreground"
              >
                {isPending ? "Loading repositories…" : search.trim() ? "No matching repositories found." : "No repositories found."}
              </PText>
            </View>
          ) : null
        }
        ListFooterComponent={
          error ? (
            <View className="gap-3 p-4">
              <PText accessibilityRole="alert" className="text-destructive">
                {error.message}
              </PText>
              <Button variant="outline" onPress={retry} loading={isFetching}>
                Try again
              </Button>
            </View>
          ) : fetchStatus === "paused" ? (
            <PText
              accessibilityLiveRegion="polite"
              className="p-4 text-muted-foreground"
            >
              Waiting for a connection…
            </PText>
          ) : isFetchingNextPage ? (
            <View className="flex-row items-center justify-center gap-2 p-4">
              <ActivityIndicator className="text-foreground" />
              <PText
                accessibilityLiveRegion="polite"
                className="text-muted-foreground"
              >
                Loading more repositories…
              </PText>
            </View>
          ) : null
        }
      />
    </View>
  );
};
