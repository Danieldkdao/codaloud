import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { CodeText, HeadingText, PText } from "@/components/ui/text";
import {
  formatProjectChangeCount,
  formatProjectChangePath,
  formatProjectDiffDisclosure,
} from "../lib/formatters";
import type { ProjectWorkspaceDiffData } from "../types";
import { createProjectWorkspaceDiffRows } from "../lib/workspace-diff";
import { ProjectWorkspaceDiffComparison, ProjectWorkspaceDiffLine } from "./project-workspace-diff-comparison";

type ProjectWorkspaceDiffProps = {
  data: ProjectWorkspaceDiffData | undefined;
  isFetching: boolean;
  isPaused: boolean;
  error: Error | null;
  onRefresh: () => void;
};

export const ProjectWorkspaceDiff = ({
  data,
  isFetching,
  isPaused,
  error,
  onRefresh,
}: ProjectWorkspaceDiffProps) => {
  const insets = useSafeAreaInsets();
  // Keep disclosure state outside virtualized rows so scrolling preserves it.
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFile = (path: string) => {
    setCollapsedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const rows = useMemo(() => createProjectWorkspaceDiffRows(data?.files ?? [], collapsedPaths), [data, collapsedPaths]);
  const notInitialized = data?.repositoryState === "not-initialized";

  return (
    <FlatList
      className="flex-1"
      accessibilityLabel="Full workspace diff"
      data={rows}
      keyExtractor={(row) => row.key}
      initialNumToRender={24}
      maxToRenderPerBatch={24}
      windowSize={5}
      extraData={collapsedPaths}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={Boolean(data) && isFetching}
      onRefresh={!isFetching && !isPaused ? onRefresh : undefined}
      contentContainerStyle={{
        flexGrow: 1,
        paddingBottom: insets.bottom + 24,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      ListHeaderComponent={
        data ? (
          <View className="gap-2 px-4 py-3">
            <View className="flex-row items-center justify-between gap-3">
              <PText className="text-base">
                {formatProjectChangeCount(data.summary.fileCount)}
              </PText>
              <Button
                variant="outline"
                accessibilityLabel="Refresh workspace diff"
                disabled={isFetching || isPaused}
                onPress={onRefresh}
              >
                Refresh
              </Button>
            </View>
            {isPaused || isFetching || error ? (
              <PText
                className="text-base text-muted-foreground"
                accessibilityLiveRegion="polite"
              >
                {isPaused
                  ? "Waiting for a connection… Showing previously loaded changes."
                  : isFetching
                    ? "Updating changes…"
                    : "Couldn’t refresh changes. Showing previously loaded changes."}
              </PText>
            ) : null}
            {error && !isFetching ? <PText className="text-base text-muted-foreground">{error.message}</PText> : null}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View
          className="flex-1 items-center justify-center gap-4 px-6 py-8"
          accessibilityLiveRegion="polite"
        >
          {!data && isFetching && !isPaused ? (
            <ActivityIndicator className="text-primary" accessible={false} />
          ) : null}
          <HeadingText
            accessibilityRole="header"
            className="text-center text-3xl"
          >
            {data
              ? notInitialized
                ? "Git is not initialized"
                : "No uncommitted changes"
              : isPaused
                ? "Waiting for a connection…"
                : error && !isFetching
                  ? "Unable to load changes"
                  : "Loading changes…"}
          </HeadingText>
          <PText className="text-center text-base text-muted-foreground">
            {data
              ? notInitialized
                ? "Initialize a Git repository in this workspace to track changes."
                : "Saved changes will appear here."
              : isPaused
                ? "Changes will load when you reconnect."
                : error && !isFetching
                  ? "We couldn’t read your workspace changes. Please try again."
                  : "Reading the workspace’s saved changes."}
          </PText>
          {!data && error && !isFetching && !isPaused ? (
            <View className="gap-3">
              <PText className="text-center text-base text-muted-foreground">{error.message}</PText>
              <Button accessibilityLabel="Retry workspace diff" onPress={onRefresh}>
                Try again
              </Button>
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item: row }) => {
        switch (row.kind) {
          case "line": return <ProjectWorkspaceDiffLine line={row.line} />;
          case "comparison": return <ProjectWorkspaceDiffComparison comparison={row.comparison} status={row.status} />;
          case "file": break;
        }
        const file = row.file;
        const path = formatProjectChangePath(file.path);
        const expanded = !collapsedPaths.has(file.path);
        const disclosure = formatProjectDiffDisclosure(file.path, expanded);
        return (
          <View className="border-t border-border bg-card/25">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={disclosure.label}
              accessibilityState={{ expanded }}
              onPress={() => toggleFile(file.path)}
              className="min-h-12 flex-row items-center gap-3 px-4 py-4 active:opacity-60"
            >
              <View className="min-w-0 flex-1 gap-2">
                <CodeText
                  className="text-base font-semibold text-foreground"
                >
                  {path.name}
                </CodeText>
                <PText className="text-base text-muted-foreground">
                  {path.directory}
                </PText>
                {file.originalPath ? (
                  <PText className="text-base text-muted-foreground">
                    From {file.originalPath}
                  </PText>
                ) : null}
              </View>
              <Icon family="Feather" name={disclosure.icon} size={22} className="text-muted-foreground" accessible={false} />
            </Pressable>

          </View>
        );
      }}
    />
  );
};
