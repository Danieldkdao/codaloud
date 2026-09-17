import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { useThemeColor } from "@/hooks/use-theme";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        style={{ width, height: height * 0.72 }}
        className="gap-3 px-5 pb-6 pt-3"
        accessibilityViewIsModal
      >
        <View className="flex-row items-center justify-between gap-3">
          <PText className="text-xl font-semibold">
            {selected ? "Stash details" : "Saved stashes"}
          </PText>
          <Button
            variant="ghost"
            onPress={selected ? () => setSelected(null) : onClose}
          >
            {selected ? "Back" : "Done"}
          </Button>
        </View>
        {selected ? (
          <>
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
          <Input
            type="search"
            accessibilityLabel="Search stashes"
            placeholder="Search stashes"
            value={search}
            onChangeText={setSearch}
            maxLength={200}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!operation.isWorkspaceBusy}
          />
        )}
        {active.isFetching && (
          <ActivityIndicator
            className="text-primary"
            accessibilityLabel="Loading stashes"
          />
        )}
        {active.fetchStatus === "paused" && (
          <PText className="text-base text-muted-foreground">
            Reconnect to load stashes.
          </PText>
        )}
        {active.error && (
          <View className="gap-2">
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
            data={entries}
            keyExtractor={(stash) => `${stash.index}/${stash.sha}`}
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
                onPress={() => setSelected(item)}
                className="gap-1 border-b border-border py-4 disabled:opacity-40"
              >
                <PText className="text-base font-medium">{item.message}</PText>
                <PText className="text-base text-muted-foreground">
                  {formatCommitTimestamp(item.createdAt)}
                </PText>
              </Pressable>
            )}
            ListEmptyComponent={
              !query.isPending && !query.error ? (
                <PText className="text-base text-muted-foreground">
                  {search ? "No matching stashes." : "No saved stashes."}
                </PText>
              ) : null
            }
            ListFooterComponent={
              query.hasNextPage ? (
                <Button
                  accessibilityLabel="Load more stashes"
                  disabled={query.isFetching || operation.isWorkspaceBusy}
                  onPress={() => void query.loadMore()}
                >
                  Load more
                </Button>
              ) : null
            }
          />
        )}
      </View>
    </ContentSheet>
  );
};
