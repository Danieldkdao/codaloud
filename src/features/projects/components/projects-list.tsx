import { useMemo } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";

import { ProjectsListItem } from "@/features/projects/components/projects-list-item";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { useProjects } from "@/features/projects/hooks/use-projects";
import type { ProjectParamsSchema } from "@/features/projects/lib/project-params";
import { cn } from "@/lib/utils";

type ProjectsListProps = {
  filters?: Partial<ProjectParamsSchema>;
  onClearSearch?: () => void;
  className?: string;
};

export const ProjectsList = ({ filters, onClearSearch, className }: ProjectsListProps) => {
  const {
    data,
    isPending,
    isFetching,
    isRefetching,
    isFetchingNextPage,
    isFetchNextPageError,
    error,
    fetchStatus,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useProjects(filters);
  const projects = useMemo(() => {
    // Offset pages can overlap when projects are updated between requests.
    const seen = new Set<string>();
    return (data?.pages.flat() ?? []).filter((project) => {
      if (seen.has(project.id)) return false;
      seen.add(project.id);
      return true;
    });
  }, [data]);
  const isPaused = fetchStatus === "paused";
  const hasSearch = Boolean(filters?.search?.trim());

  const loadMore = () => {
    if (hasNextPage && !isFetching && !error && !isPaused) {
      void fetchNextPage({ cancelRefetch: false });
    }
  };
  const refresh = () => {
    if (!isFetching && !isPaused) void refetch();
  };
  const retry = () => {
    if (isFetching || isPaused) return;
    if (isFetchNextPageError) void fetchNextPage({ cancelRefetch: false });
    else void refetch();
  };

  return (
    <FlatList
      className={cn("w-full flex-1", className)}
      data={projects}
      keyExtractor={(project) => project.id}
      renderItem={({ item }) => <ProjectsListItem project={item} />}
      contentContainerStyle={{ flexGrow: 1, paddingVertical: 12, gap: 12 }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      onRefresh={refresh}
      refreshing={isRefetching && fetchStatus === "fetching"}
      ListEmptyComponent={
        error ? null : (
          <View className="flex-1 items-center justify-center gap-3 px-6 py-12">
            {isPaused ? (
              <PText className="text-center text-muted-foreground">
                Waiting for a connection…
              </PText>
            ) : isPending ? (
              <>
                <ActivityIndicator
                  className="text-primary"
                  accessible={false}
                />
                <PText className="text-muted-foreground">
                  Loading projects…
                </PText>
              </>
            ) : (
              <>
                <Icon
                  family="Feather"
                  name="folder"
                  size={32}
                  className="text-muted-foreground"
                  accessible={false}
                />
                <HeadingText className="text-center text-2xl">
                  {hasSearch ? "No matching projects" : "No projects yet"}
                </HeadingText>
                <PText className="text-center text-muted-foreground">
                  {hasSearch
                    ? "Try a different search or clear it to see all your projects."
                    : "Your projects will appear here once you create one."}
                </PText>
                {hasSearch && onClearSearch && (
                  <Button variant="outline" onPress={onClearSearch}>
                    Clear search
                  </Button>
                )}
              </>
            )}
          </View>
        )
      }
      ListFooterComponent={
        error ? (
          <View className="items-center gap-3 px-6 py-6">
            <PText
              accessibilityRole="alert"
              className="text-center text-destructive"
            >
              {error.message}
            </PText>
            <Button
              variant="outline"
              onPress={retry}
              disabled={isFetching || isPaused}
            >
              Try again
            </Button>
          </View>
        ) : isPaused && projects.length > 0 ? (
          <PText className="py-6 text-center text-muted-foreground">
            Waiting for a connection…
          </PText>
        ) : isFetchingNextPage ? (
          <View className="items-center gap-3 py-6">
            <ActivityIndicator className="text-primary" accessible={false} />
            <PText className="text-muted-foreground">
              Loading more projects…
            </PText>
          </View>
        ) : null
      }
    />
  );
};
