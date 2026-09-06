import { useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";

import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { PText } from "@/components/ui/text";
import type { GitHubRepository } from "@/features/projects/types";
import { cn } from "@/lib/utils";
import { GitHubRepositorySelectItem } from "@/services/github/components/github-repository-select-item";
import { useGitHubRepositories } from "@/services/github/hooks/use-github-repositories";

export type GitHubRepositoriesSelectListProps = {
  className?: string;
  selectedRepositoryId: string | null;
  onValueChange: (repositoryId: string | null) => void;
};

export const GitHubRepositoriesSelectList = ({
  className,
  selectedRepositoryId,
  onValueChange,
}: GitHubRepositoriesSelectListProps) => {
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
  const selectedRepository = repositories.find(
    (repository) => String(repository.id) === selectedRepositoryId,
  );

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
    <>
      <View
        className={cn(
          "max-h-80 min-h-24 shrink overflow-hidden rounded-xl border border-border bg-card",
          className,
          selectedRepository && "h-auto min-h-0 shrink-0",
        )}
      >
        {selectedRepository ? (
          <GitHubRepositorySelectItem
            repository={selectedRepository}
            selected
            onPress={() => onValueChange(null)}
          />
        ) : (
          <>
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
                <GitHubRepositorySelectItem
                  repository={item}
                  onPress={() => onValueChange(String(item.id))}
                />
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
          </>
        )}
      </View>
      <PText accessibilityLiveRegion="polite" className="text-muted-foreground">
        Selected repository ID: {selectedRepositoryId ?? "null"}
      </PText>
    </>
  );
};
