import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { useThemeColor } from "@/hooks/use-theme";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { CodeText, PText } from "@/components/ui/text";
import { useProjectStashes } from "../hooks/use-project-stashes";
import { useProjectStashOperations } from "../hooks/use-project-stash-operations";
import type { GitStashListSchema } from "../server/git-stash-schemas";
import {
  formatCommitTimestamp,
  formatProjectStashLabel,
  formatProjectStashPatchLine,
} from "../lib/formatters";

type Stash = GitStashListSchema["stashes"][number];
export const ProjectStashSheet = ({ onClose }: { onClose: () => void }) => {
  const card = useThemeColor("card");
  const { width, height } = useWindowDimensions();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Stash | null>(null);
  const { operation, pop } = useProjectStashOperations();
  const query = useProjectStashes(operation.projectId, {
    search,
    stashIndex: selected?.index,
    stashSha: selected?.sha,
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
  const detail = query.stashDetails;
  const lines = useMemo(
    () => detail.data?.patch?.split("\n") ?? [],
    [detail.data?.patch],
  );
  const active = selected ? detail : query;
  return (
    <ContentSheet
      open
      backgroundColor={card}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <View
        style={
          selected
            ? { width, height: height * 0.72 }
            : { width, maxHeight: height * 0.72 }
        }
        className={selected ? "gap-3 px-5 pb-6 pt-3" : undefined}
        accessibilityViewIsModal
        onAccessibilityEscape={selected ? () => setSelected(null) : onClose}
      >
        {selected ? (
          <>
            <View className="flex-row items-center justify-between gap-3">
              <PText className="text-xl font-semibold">Stash details</PText>
              <Button variant="ghost" onPress={() => setSelected(null)}>
                Back
              </Button>
            </View>
            <PText selectable className="text-base">
              {selected.message}
            </PText>
            <Button
              accessibilityLabel="Pop selected stash"
              disabled={
                operation.isWorkspaceBusy || !detail.data || !!detail.error
              }
              loading={operation.workspaceOperation === "Restoring stash…"}
              onPress={() => {
                void pop(selected).then((result) => {
                  if (result) setSelected(null);
                });
              }}
            >
              Pop this stash
            </Button>
          </>
        ) : (
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
        )}
        {active.isFetching && (
          <ActivityIndicator
            className={selected ? "text-primary" : "py-3 text-primary"}
            accessibilityLabel="Loading stashes"
          />
        )}
        {active.fetchStatus === "paused" && (
          <PText className={selected
            ? "text-base text-muted-foreground"
            : "px-5 py-3 text-center text-base text-muted-foreground"}>
            Reconnect to load stashes.
          </PText>
        )}
        {active.error && (
          <View className={selected ? "gap-2" : "gap-2 px-5 py-3"}>
            <PText
              selectable
              accessibilityRole="alert"
              className="text-base text-destructive"
            >
              {active.error.message}
            </PText>
            <Button
              disabled={active.isFetching || operation.isWorkspaceBusy}
              onPress={() => {
                if (selected) void detail.refetch();
                else void query.retry();
              }}
            >
              Try again
            </Button>
          </View>
        )}
        {selected ? (
          <FlatList
            data={lines}
            keyExtractor={(_line, index) => String(index)}
            initialNumToRender={25}
            windowSize={5}
            contentInsetAdjustmentBehavior="automatic"
            accessibilityLabel="Stash patch"
            renderItem={({ item }) => (
              <CodeText
                selectable
                className={`text-base ${formatProjectStashPatchLine(item)}`}
              >
                {item || " "}
              </CodeText>
            )}
            ListEmptyComponent={
              !active.isPending ? (
                <PText className="text-base text-muted-foreground">
                  No text diff available for this stash.
                </PText>
              ) : null
            }
          />
        ) : (
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
              <Pressable
                disabled={operation.isWorkspaceBusy}
                accessibilityRole="button"
                accessibilityLabel={formatProjectStashLabel(item.index)}
                onPress={() => {
                  Keyboard.dismiss();
                  setSelected(item);
                }}
                className="gap-1 border-b border-border px-5 py-4 active:bg-secondary disabled:opacity-40"
              >
                <PText className="text-base font-medium">{item.message}</PText>
                <PText className="text-base text-muted-foreground">
                  {formatCommitTimestamp(item.createdAt)}
                </PText>
              </Pressable>
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
        )}
      </View>
    </ContentSheet>
  );
};
