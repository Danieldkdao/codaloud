import { ActivityIndicator, FlatList, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { DraftsListItem } from "@/features/drafts/components/drafts-list-item";
import { useDrafts } from "@/features/drafts/hooks/use-drafts";
import type { DraftParamsSchema } from "@/features/drafts/lib/draft-params";
import { cn } from "@/lib/utils";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";
import type { DraftPageData, DraftResponseData } from "../types";

const pageDrafts = (page: DraftPageData) => page.drafts;
const draftKey = (draft: DraftResponseData) => draft.id;

type DraftsListProps = {
  filters?: Partial<DraftParamsSchema>;
  onClearSearch?: () => void;
  onNewDraft?: () => void;
  className?: string;
};

export const DraftsList = ({
  filters,
  onClearSearch,
  onNewDraft,
  className,
}: DraftsListProps) => {
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
  } = useDrafts(filters);
  const drafts = useUniquePaginatedItems(data?.pages, pageDrafts, draftKey);
  const hasSearch = Boolean(filters?.search?.trim());

  const loadMore = () => {
    if (hasNextPage && !isFetching && !error)
      void fetchNextPage({ cancelRefetch: false });
  };
  const refresh = () => {
    if (!isFetching) void refetch();
  };
  const retry = () => {
    if (isFetching) return;
    if (isFetchNextPageError) void fetchNextPage({ cancelRefetch: false });
    else void refetch();
  };

  return (
    <FlatList
      className={cn("w-full flex-1", className)}
      data={drafts}
      keyExtractor={(draft) => draft.id}
      renderItem={({ item }) => <DraftsListItem draft={item} />}
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
            {isPending ? (
              <>
                <ActivityIndicator className="text-primary" accessible={false} />
                <PText>Loading drafts…</PText>
              </>
            ) : (
              <>
                <Icon
                  family="Feather"
                  name="file-text"
                  size={32}
                  className="text-muted-foreground"
                  accessible={false}
                />
                <HeadingText className="text-center text-2xl">
                  {hasSearch ? "No matching drafts" : "No drafts yet"}
                </HeadingText>
                <PText className="text-center">
                  {hasSearch
                    ? "Try a different search or clear it to see all your drafts."
                    : "Capture code, an idea, or a note before choosing a project."}
                </PText>
                {hasSearch && onClearSearch ? (
                  <Button variant="outline" onPress={onClearSearch}>
                    Clear search
                  </Button>
                ) : (
                  !isPending &&
                  onNewDraft && (
                    <Button onPress={onNewDraft}>New draft</Button>
                  )
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
            <Button variant="outline" onPress={retry} disabled={isFetching}>
              Try again
            </Button>
          </View>
        ) : isFetchingNextPage ? (
          <View className="items-center gap-3 py-6">
            <ActivityIndicator className="text-primary" accessible={false} />
            <PText>Loading more drafts…</PText>
          </View>
        ) : null
      }
    />
  );
};
