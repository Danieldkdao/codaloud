import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { ScrollFadeFlatList } from "@/components/ui/scroll-fade-flat-list";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { GitHubRepositoryBranchItem } from "@/services/github/components/github-repository-branch-item";
import { useGitHubRepositoryBranches } from "@/services/github/hooks/use-github-repository-branches";
import type { GitHubRepositoryBranch, GitHubRepositoryBranchPage } from "@/services/github/types";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";

const getBranches = (page: GitHubRepositoryBranchPage) => page.branches;
const getBranchKey = (branch: GitHubRepositoryBranch) => branch.name;

export type GitHubRepositoryBranchesListProps = {
  repositoryId: string;
  className?: string;
  selectedBranchName: string | null;
  onValueChange: (branchName: string | null) => void;
};

export const GitHubRepositoryBranchesList = ({
  repositoryId, className, selectedBranchName, onValueChange,
}: GitHubRepositoryBranchesListProps) => {
  const [search, setSearch] = useState("");
  const {
    data, isPending, isFetching, isFetchingNextPage,
    fetchStatus, error, hasNextPage, loadMore, retry,
  } = useGitHubRepositoryBranches(repositoryId, { search });
  const branches = useUniquePaginatedItems(data?.pages, getBranches, getBranchKey);
  // The repository's default branch may not be in the loaded pages yet.
  const selectedBranch = selectedBranchName
    ? branches.find((branch) => branch.name === selectedBranchName) ?? { name: selectedBranchName }
    : null;

  return (
    <View className={cn(
      "max-h-64 min-h-24 shrink overflow-hidden rounded-xl border border-border bg-card",
      className,
      selectedBranch && "h-auto min-h-0 shrink-0",
    )}>
      {selectedBranch ? (
        <GitHubRepositoryBranchItem branch={selectedBranch} selected onPress={() => onValueChange(null)} />
      ) : (
        <>
          <View className="p-3">
            <SearchInput initialSearch={search} onValueChange={setSearch} placeholder="Search branches" />
          </View>
          <ScrollFadeFlatList<GitHubRepositoryBranch>
            key={`${repositoryId}:${search.trim().toLowerCase()}`}
            containerStyle={{ flex: 0, flexShrink: 1, minHeight: 96 }}
            className="min-h-24 shrink overflow-hidden"
            accessibilityLabel="GitHub repository branches"
            data={branches}
            keyExtractor={(branch) => branch.name}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            renderItem={({ item }) => <GitHubRepositoryBranchItem branch={item} onPress={() => onValueChange(item.name)} />}
            ItemSeparatorComponent={() => <View className="h-px bg-border" />}
            ListEmptyComponent={
              !error && fetchStatus !== "paused" ? (
                <View className="items-center gap-2 p-4">
                  {isPending && <ActivityIndicator className="text-foreground" />}
                  <PText accessibilityLiveRegion="polite">
                    {isPending
                      ? "Loading branches…"
                      : hasNextPage
                        ? "No matches yet. Continue searching."
                        : search.trim()
                          ? "No matching branches found."
                          : "No branches found."}
                  </PText>
                </View>
              ) : null
            }
            ListFooterComponent={
              error ? (
                <View className="gap-3 p-4">
                  <PText accessibilityRole="alert" className="text-destructive">{error.message}</PText>
                  <Button variant="outline" onPress={retry} loading={isFetching}>Try again</Button>
                </View>
              ) : fetchStatus === "paused" ? (
                <PText accessibilityLiveRegion="polite" className="p-4">Waiting for a connection…</PText>
              ) : isFetchingNextPage ? (
                <View className="flex-row items-center justify-center gap-2 p-4">
                  <ActivityIndicator className="text-foreground" />
                  <PText accessibilityLiveRegion="polite">Loading more branches…</PText>
                </View>
              ) : hasNextPage ? (
                <View className="p-3">
                  <Button variant="outline" onPress={loadMore} disabled={isFetching}>
                    {branches.length ? "Load more branches" : "Continue searching"}
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
