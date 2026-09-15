import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { formatProjectChangeCount } from "../lib/formatters";
import type { ProjectWorkspaceDiffData } from "../types";
import { ProjectDiffList } from "./project-diff-list";

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
  const notInitialized = data?.repositoryState === "not-initialized";

  return (
    <ProjectDiffList
      files={data?.files ?? []}
      accessibilityLabel="Full workspace diff"
      refreshing={Boolean(data) && isFetching}
      onRefresh={!isFetching && !isPaused ? onRefresh : undefined}
      header={
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
      empty={
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
    />
  );
};
