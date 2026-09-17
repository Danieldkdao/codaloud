import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  View,
  useWindowDimensions,
} from "react-native";
import { useThemeColor } from "@/hooks/use-theme";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { useProjectStashes } from "../hooks/use-project-stashes";
import { useProjectStashOperations } from "../hooks/use-project-stash-operations";
import { ProjectStashListItem } from "./project-stash-list-item";

export const ProjectStashSheet = ({ onClose }: { onClose: () => void }) => {
  const card = useThemeColor("card");
  const { width, height } = useWindowDimensions();
  const [search, setSearch] = useState("");
  const { operation, pop, remove } = useProjectStashOperations();
  const query = useProjectStashes(operation.projectId, {
    search,
  });
  const entries = useMemo(() => {
    const seen = new Set<string>();
    return (
      query.data?.pages
        .flatMap((page) => page.stashes)
        .filter((stash) => {
          const key = `${stash.index}/${stash.sha}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }) ?? []
    );
  }, [query.data]);
  return (
    <ContentSheet
      open
      backgroundColor={card}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <View
        style={{ width, maxHeight: height * 0.72 }}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        <View className="shrink-0 border-b border-border px-5 pt-2 pb-3">
          <View className="flex-row items-center gap-2">
            <Icon
              family="Feather"
              name="search"
              size={20}
              className="text-muted-foreground"
              accessible={false}
            />
            <Input
              type="search"
              variant="ghost"
              size="sm"
              accessibilityLabel="Search stashes"
              placeholder="Search stashes"
              value={search}
              onChangeText={setSearch}
              maxLength={200}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!operation.isWorkspaceBusy}
              containerClassName="min-w-0 flex-1"
              className="border-0 px-0 py-1 focus:border-transparent focus:outline-0"
            />
          </View>
        </View>
        {(query.isFetching ||
          operation.workspaceOperation === "Restoring stash…") && (
          <ActivityIndicator
            className="py-3 text-primary"
            accessibilityLabel={operation.workspaceOperation ?? "Loading stashes"}
          />
        )}
        {query.fetchStatus === "paused" && (
          <PText className="px-5 py-3 text-center text-base text-muted-foreground">
            Reconnect to load stashes.
          </PText>
        )}
        {query.error && (
          <View className="gap-2 px-5 py-3">
            <PText
              selectable
              accessibilityRole="alert"
              className="text-base text-destructive"
            >
              {query.error.message}
            </PText>
            <Button
              disabled={query.isFetching || operation.isWorkspaceBusy}
              onPress={() => {
                void query.retry();
              }}
            >
              Try again
            </Button>
          </View>
        )}
        <FlatList
          key={search.trim().toLowerCase()}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ paddingBottom: entries.length ? 24 : 0 }}
          accessibilityLabel="Saved stashes"
          data={entries}
          extraData={operation.isWorkspaceBusy}
          keyExtractor={(stash) => `${stash.index}/${stash.sha}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          onEndReached={() => {
            if (!operation.isWorkspaceBusy) void query.loadMore();
          }}
          onEndReachedThreshold={0.3}
          refreshing={query.isFetching && !query.isPending}
          onRefresh={() => {
            if (!operation.isWorkspaceBusy) void query.refetch();
          }}
          renderItem={({ item }) => (
            <ProjectStashListItem
              stash={item}
              disabled={operation.isWorkspaceBusy}
              onSelect={() => {
                Keyboard.dismiss();
                void pop(item);
              }}
              onDelete={() => {
                Keyboard.dismiss();
                return remove(item);
              }}
            />
          )}
          ListEmptyComponent={
            !query.isPending &&
            !query.error &&
            query.fetchStatus !== "paused" ? (
              <View className="items-center justify-center px-5 py-8">
                <PText
                  accessibilityLiveRegion="polite"
                  className="text-center text-base text-muted-foreground"
                >
                  {search.trim() ? "No matching stashes." : "No saved stashes."}
                </PText>
              </View>
            ) : null
          }
          ListFooterComponent={
            query.hasNextPage ? (
              <View className="px-5 pt-3">
                <Button
                  accessibilityLabel="Load more stashes"
                  disabled={query.isFetching || operation.isWorkspaceBusy}
                  onPress={() => void query.loadMore()}
                >
                  Load more
                </Button>
              </View>
            ) : null
          }
        />
      </View>
    </ContentSheet>
  );
};
