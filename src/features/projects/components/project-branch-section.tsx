import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import type { useProjectBranches } from "../hooks/use-project-branches";
import type { ProjectBranchSource } from "../hooks/use-project-workspace-branch";
import { formatProjectBranchSource } from "../lib/formatters";

type BranchSectionQuery = Pick<
  ReturnType<typeof useProjectBranches>,
  | "error"
  | "isPending"
  | "isFetching"
  | "isFetchingNextPage"
  | "isFetchNextPageError"
  | "fetchStatus"
  | "hasNextPage"
> & { data?: unknown; loadMore: () => unknown; retry: () => unknown };

type ProjectBranchSectionProps = {
  source: ProjectBranchSource;
  branches: string[];
  selectedBranch: string | null;
  search: string;
  open: boolean;
  query: BranchSectionQuery;
  onSelect: (name: string) => void;
  onDelete?: (name: string) => void;
  currentBranch?: string | null;
  disabled?: boolean;
};

const formatBranchLoadError = (
  message: string,
  hasData: boolean,
  isNextPageError: boolean,
) => {
  if (isNextPageError) return "Couldn’t load more branches. Please try again.";
  if (hasData)
    return "Couldn’t refresh branches. Showing previously loaded branches.";
  return message;
};

export const ProjectBranchSection = ({
  source,
  branches,
  selectedBranch,
  search,
  open,
  query,
  onSelect,
  onDelete,
  currentBranch,
  disabled = false,
}: ProjectBranchSectionProps) => {
  const { title, icon } = formatProjectBranchSource(source);
  const { height } = useWindowDimensions();
  // Use a screen-based cap: a percentage of the content-sized sheet creates a circular measurement.
  const maxHeight = Math.min(320, height * 0.35);
  return (
    <View style={{ maxHeight, flexShrink: 1, minHeight: 0 }}>
      <View className="flex-row items-center gap-2 px-5 pt-3 pb-2">
        <Icon
          family="Feather"
          name={icon}
          size={18}
          className="text-muted-foreground"
          accessible={false}
        />
        <PText accessibilityRole="header" className="text-base font-medium">
          {title}
        </PText>
      </View>
      {/* Solid-color edge fades create opaque bands over the native sheet material. */}
      <FlatList
        key={search.trim().toLowerCase()}
        style={{ flexGrow: 0, flexShrink: 1 }}
        accessibilityLabel={title}
        data={branches}
        extraData={{ selectedBranch, currentBranch, disabled }}
        keyExtractor={(name) => name}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={() => {
          if (open && !disabled) query.loadMore();
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !query.error && query.fetchStatus !== "paused" ? (
            <View className="items-center gap-3 px-5 py-4">
              {query.isPending && (
                <ActivityIndicator className="text-foreground" />
              )}
              <PText
                accessibilityLiveRegion="polite"
                className="text-center text-base text-muted-foreground"
              >
                {query.isPending
                  ? "Loading branches…"
                  : query.hasNextPage
                    ? "No matches yet. Continue searching."
                    : search.trim()
                      ? "No matching branches found."
                      : "No branches found."}
              </PText>
            </View>
          ) : null
        }
        ListFooterComponent={
          query.fetchStatus === "paused" ? (
            <PText
              accessibilityLiveRegion="polite"
              className="p-5 text-base text-muted-foreground"
            >
              Waiting for a connection…
            </PText>
          ) : query.isFetching && query.data ? (
            <View className="flex-row items-center justify-center gap-3 p-5">
              <ActivityIndicator className="text-foreground" />
              <PText
                accessibilityLiveRegion="polite"
                className="text-base text-muted-foreground"
              >
                {query.isFetchingNextPage
                  ? "Loading more branches…"
                  : "Refreshing branches…"}
              </PText>
            </View>
          ) : query.error ? (
            <View className="gap-3 p-5">
              <PText
                accessibilityRole="alert"
                className="text-base text-destructive"
              >
                {formatBranchLoadError(
                  query.error.message,
                  Boolean(query.data),
                  query.isFetchNextPageError,
                )}
              </PText>
              <Button
                variant="outline"
                onPress={() => {
                  query.retry();
                }}
                disabled={disabled}
                loading={query.isFetching}
              >
                Try again
              </Button>
            </View>
          ) : query.hasNextPage ? (
            <View className="p-5">
              <Button
                variant="outline"
                onPress={() => {
                  query.loadMore();
                }}
                disabled={disabled || query.isFetching}
              >
                {branches.length ? "Load more branches" : "Continue searching"}
              </Button>
            </View>
          ) : null
        }
        renderItem={({ item: name }) => (
          <View className="flex-row items-center">
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={
                source === "remote" ? `Remote branch: ${name}` : name
              }
              accessibilityState={{
                checked: selectedBranch === name,
                disabled,
              }}
              disabled={disabled}
              onPress={() => onSelect(name)}
              className="min-h-20 min-w-0 flex-1 flex-row items-center gap-4 px-5 py-4 active:bg-secondary"
            >
              <PText className="min-w-0 flex-1 text-xl font-medium text-foreground">
                {name}
              </PText>
              {selectedBranch === name && (
                <Icon
                  family="Feather"
                  name="check"
                  size={26}
                  className="text-foreground"
                  accessible={false}
                />
              )}
            </Pressable>
            {source === "local" && onDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete local branch ${name}`}
                disabled={disabled || currentBranch === name}
                accessibilityState={{
                  disabled: disabled || currentBranch === name,
                }}
                onPress={() => onDelete(name)}
                className="size-12 mr-3 items-center justify-center rounded-full active:bg-destructive/10 disabled:opacity-40"
              >
                <Icon
                  family="Feather"
                  name="trash-2"
                  size={20}
                  className="text-destructive"
                  accessible={false}
                />
              </Pressable>
            ) : null}
          </View>
        )}
      />
    </View>
  );
};
