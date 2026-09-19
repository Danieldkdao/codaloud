import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { CodeText, PText } from "@/components/ui/text";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import {
  formatCommitDate,
  formatCommitHash,
  formatCommitSubject,
} from "@/features/projects/lib/formatters";
import type { ProjectCommitData } from "@/features/projects/types";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useProjectWorkspaceBranch } from "../hooks/use-project-workspace-branch";
import { useProjectCommitHistory } from "../hooks/use-project-commit-history";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";
import type { ProjectCommitPageSchema } from "../actions/commit-schemas";

const getCommits = (page: ProjectCommitPageSchema): ProjectCommitData[] =>
  page.commits;
const getCommitKey = (commit: ProjectCommitData) => commit.hash;

type ProjectCommitListProps = {
  active: boolean;
};

export const ProjectCommitList = ({ active }: ProjectCommitListProps) => {
  const router = useRouter();
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const insets = useSafeAreaInsets();
  const {
    projectId,
    branch,
    branchSource,
    commitSearch,
    isBranchLoading,
    isCheckingOut,
  } = useProjectWorkspaceBranch();
  const query = useProjectCommitHistory(projectId, {
    branch: branch ?? undefined,
    source: branchSource ?? undefined,
    search: commitSearch,
    enabled: active && !isCheckingOut,
  });
  const commits = useUniquePaginatedItems(
    query.data?.pages,
    getCommits,
    getCommitKey,
  );

  if (isCheckingOut) {
    return (
      <ProjectWorkspaceState
        isLoading
        icon="git-commit"
        title="Switching branches…"
        description="Updating your workspace before loading commit history."
      />
    );
  }

  if (!branch || !branchSource) {
    if (isBranchLoading) {
      return (
        <ProjectWorkspaceState
          isLoading
          icon="git-commit"
          title="Loading branches…"
          description="Finding your workspace’s current branch."
        />
      );
    }
    return (
      <ProjectWorkspaceState
        icon="git-commit"
        title="Select a branch"
        description="Choose a local or remote branch to view its commit history."
      />
    );
  }

  if (query.isPending && query.fetchStatus !== "paused" && !query.error) {
    return (
      <ProjectWorkspaceState
        isLoading
        icon="git-commit"
        title="Loading commits…"
        description="Getting this branch’s history."
      />
    );
  }

  if (
    commits.length === 0 &&
    !query.hasNextPage &&
    !query.isFetching &&
    !query.error &&
    query.fetchStatus !== "paused"
  ) {
    return (
      <View className="flex-1">
        <ProjectWorkspaceState
          icon="git-commit"
          title={commitSearch.trim() ? "No matching commits" : "No commits yet"}
          description={
            commitSearch.trim()
              ? "Try another commit message, author, or hash."
              : "Your commits will appear here once you save changes to Git."
          }
        />
      </View>
    );
  }

  return (
    <FlatList
      key={JSON.stringify([
        projectId,
        branchSource,
        branch,
        commitSearch.trim().toLowerCase(),
      ])}
      className="flex-1 bg-background"
      accessibilityLabel="Commit history"
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
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReached={() => {
        if (active) query.onLoadMore();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        query.fetchStatus === "paused" ? (
          <PText
            accessibilityLiveRegion="polite"
            className="py-5 text-center text-base text-muted-foreground"
          >
            Waiting for a connection…
          </PText>
        ) : query.isFetching ? (
          <View
            className="items-center py-5"
            accessibilityRole="progressbar"
            accessibilityLabel={
              query.isFetchingNextPage
                ? "Loading more commits"
                : "Refreshing commits"
            }
          >
            <ActivityIndicator className="text-primary" />
          </View>
        ) : query.error ? (
          <View className="gap-3 py-5">
            <PText
              accessibilityRole="alert"
              className="text-base text-destructive"
            >
              {query.error.message}
            </PText>
            <Button
              variant="outline"
              accessibilityLabel="Retry commit history"
              onPress={() => {
                query.retry();
              }}
            >
              Try again
            </Button>
          </View>
        ) : query.hasNextPage ? (
          <View className="py-5">
            <Button
              variant="outline"
              accessibilityLabel={
                commits.length
                  ? "Load more commits"
                  : "Continue searching commits"
              }
              onPress={() => {
                query.onLoadMore();
              }}
              disabled={!active}
            >
              {commits.length ? "Load more commits" : "Continue searching"}
            </Button>
          </View>
        ) : null
      }
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/projects/[projectId]/git/workspace-diff",
              params: { projectId, commitSha: item.hash, source: branchSource },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`${formatCommitSubject(item.message)}, ${item.author}, ${formatCommitDate(item.committedAt)}, ${formatCommitHash(item.hash)}`}
          className="flex-row gap-3 rounded-xl active:bg-secondary"
        >
          <View
            className="w-8 items-center pt-1.5 gap-1.5"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <View className="h-7 w-8 items-center justify-center rounded-full">
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
          <View className="min-w-0 flex-1 flex-row items-center gap-3 first:border-t last:border-b-0 border-b border-border pb-2.5 pt-1.5">
            <View className="min-w-0 flex-1 gap-2">
              <PText
                className="min-w-0 font-medium text-foreground text-lg"
                numberOfLines={2}
              >
                {formatCommitSubject(item.message)}
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
                  <PText className="min-w-0" numberOfLines={1}>
                    {item.author}
                  </PText>
                </View>
                <View
                  className="size-1.5 rounded-full bg-muted-foreground"
                  accessible={false}
                />
                <PText>{formatCommitDate(item.committedAt)}</PText>
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
