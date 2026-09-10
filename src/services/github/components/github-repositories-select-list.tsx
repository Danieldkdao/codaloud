import { useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { ScrollFadeFlatList } from "@/components/ui/scroll-fade-flat-list";
import { PText } from "@/components/ui/text";
import type { GitHubRepository } from "@/services/github/types";
import { cn } from "@/lib/utils";
import { GitHubRepositorySelectItem } from "@/services/github/components/github-repository-select-item";
import { useGitHubRepositories } from "@/services/github/hooks/use-github-repositories";

export type GitHubRepositoriesSelectListProps = {
  className?: string;
  selectedRepositoryId: string | null;
  onValueChange: (repositoryId: string | null) => void;
  onReconnect?: () => void;
  isReconnecting?: boolean;
  reconnectError?: string | null;
};

export const GitHubRepositoriesSelectList = ({
  className,
  selectedRepositoryId,
  onValueChange,
  onReconnect,
  isReconnecting = false,
  reconnectError,
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
  const repositories = useMemo(() => {
    // GitHub's updated sort can move a repository across pages between requests.
    const unique = new Map<number, GitHubRepository>();
    for (const page of data?.pages ?? []) {
      for (const repository of page.repositories) {
        if (!unique.has(repository.id)) unique.set(repository.id, repository);
      }
    }
    return Array.from(unique.values());
  }, [data?.pages]);
  const selectedRepository = repositories.find(
    (repository) => String(repository.id) === selectedRepositoryId,
  );
  const needsReconnect =
    error && "code" in error && error.code === "GITHUB_RECONNECT_REQUIRED";

  const loadMore = () => {
    if (hasNextPage && !isFetching && !error && fetchStatus !== "paused") {
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
        selectedRepository && "h-auto min-h-0 shrink-0",
      )}
    >
      {needsReconnect && onReconnect ? (
        <View className="gap-3 p-4">
          <PText accessibilityRole="alert" className="text-destructive">
            {reconnectError ?? error.message}
          </PText>
          <Button
            variant="outline"
            disabled={isReconnecting}
            loading={isReconnecting}
            onPress={() => {
              onValueChange(null);
              onReconnect();
            }}
          >
            Reconnect GitHub
          </Button>
        </View>
      ) : selectedRepository ? (
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
          <ScrollFadeFlatList<GitHubRepository>
            key={search.trim().toLowerCase()}
            // Size to the rows while allowing the form's bounded picker to shrink.
            containerStyle={{ flex: 0, flexShrink: 1, minHeight: 96 }}
            className="min-h-24 shrink overflow-hidden"
            accessibilityLabel="GitHub repositories"
            data={repositories}
            keyExtractor={(repository) => String(repository.id)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
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
                  {isPending && (
                    <ActivityIndicator className="text-foreground" />
                  )}
                  <PText
                    accessibilityLiveRegion="polite"
                  >
                    {isPending
                      ? "Loading repositories…"
                      : hasNextPage
                        ? "No matches yet. Continue searching."
                        : search.trim()
                          ? "No matching repositories found."
                          : "No repositories found."}
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
                  <Button
                    variant="outline"
                    onPress={retry}
                    loading={isFetching}
                  >
                    Try again
                  </Button>
                </View>
              ) : fetchStatus === "paused" ? (
                <PText
                  accessibilityLiveRegion="polite"
                  className="p-4"
                >
                  Waiting for a connection…
                </PText>
              ) : isFetchingNextPage ? (
                <View className="flex-row items-center justify-center gap-2 p-4">
                  <ActivityIndicator className="text-foreground" />
                  <PText
                    accessibilityLiveRegion="polite"
                  >
                    Loading more repositories…
                  </PText>
                </View>
              ) : hasNextPage ? (
                <View className="p-3">
                  <Button
                    variant="outline"
                    onPress={loadMore}
                    disabled={isFetching}
                  >
                    {repositories.length
                      ? "Load more repositories"
                      : "Continue searching"}
                  </Button>
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
};
