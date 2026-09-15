import { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import * as Linking from "expo-linking";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { alert } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { CodeText, HeadingText, PText } from "@/components/ui/text";
import type { CommitSource } from "../actions/commit-schemas";
import {
  formatCommitParent,
  formatCommitSubject,
  formatCommitTimestamp,
  formatProjectChangeCount,
} from "../lib/formatters";
import { createProjectCommitDiff } from "../lib/commit-diff";
import { projectCommitDetailsParamsSchema } from "../actions/commit-details-schemas";
import { useProjectCommitDetails } from "../hooks/use-project-commit-details";
import { ProjectDiffList } from "./project-diff-list";
import { ProjectWorkspaceDiffSummary } from "./project-workspace-diff-summary";

type ProjectCommitDiffProps = {
  projectId: string;
  commitSha: string;
  source: CommitSource;
};

export const ProjectCommitDiff = ({
  projectId,
  commitSha,
  source,
}: ProjectCommitDiffProps) => {
  const query = useProjectCommitDetails(projectId, { commitSha, source });
  const data = query.data;
  const diff = useMemo(
    () => (data ? createProjectCommitDiff(data) : null),
    [data],
  );
  const validParams = projectCommitDetailsParamsSchema.safeParse({
    projectId,
    commitSha,
    source,
  }).success;
  const isPaused = query.fetchStatus === "paused";
  const error = validParams
    ? query.error
    : new Error("Invalid project, commit SHA, or source.");
  const refresh = () => {
    void query.refetch();
  };
  const openGitHub = async () => {
    if (!data?.githubUrl) return;
    try {
      await Linking.openURL(data.githubUrl);
    } catch {
      alert("Unable to open GitHub. Please try again.");
    }
  };

  return (
    <ProjectDiffList
      accessibilityLabel="Commit diff"
      files={diff?.files ?? []}
      header={
        data && diff ? (
          <View className="gap-5 px-4 pt-4 pb-5">
            {isPaused || query.isFetching || error ? (
              <View className="gap-3" accessibilityLiveRegion="polite">
                <PText className="text-base text-muted-foreground">
                  {isPaused
                    ? "Waiting for a connection… Showing previously loaded commit details."
                    : query.isFetching
                      ? "Updating commit details…"
                      : "Couldn’t refresh commit details. Showing previously loaded commit details."}
                </PText>
                {error && !query.isFetching && !isPaused ? (
                  <Button
                    variant="outline"
                    accessibilityLabel="Retry commit details"
                    onPress={refresh}
                  >
                    Try again
                  </Button>
                ) : null}
              </View>
            ) : null}
            <HeadingText
              selectable
              accessibilityRole="header"
              className="text-3xl"
            >
              {formatCommitSubject(data.commit.message)}
            </HeadingText>

            <View className="gap-3 rounded-xl border border-border bg-card/40 p-4">
              <View className="flex-row items-center gap-3">
                <View className="size-11 items-center justify-center rounded-full bg-secondary">
                  <Icon
                    family="Feather"
                    name="user"
                    size={20}
                    className="text-muted-foreground"
                    accessible={false}
                  />
                </View>
                <View className="min-w-0 flex-1 gap-1">
                  <PText selectable className="text-base font-semibold">
                    {data.commit.author}
                  </PText>
                  <PText selectable className="text-base text-muted-foreground">
                    {data.commit.authorEmail}
                  </PText>
                </View>
              </View>
              <PText selectable className="text-base text-muted-foreground">
                Committed {formatCommitTimestamp(data.commit.committedAt)}
              </PText>
              <View className="flex-row flex-wrap items-center gap-2">
                <PText className="text-base text-muted-foreground">
                  Parent
                </PText>
                <CodeText
                  selectable
                  className="text-base text-muted-foreground"
                >
                  {formatCommitParent(data.baseSha)}
                </CodeText>
              </View>
            </View>

            <View className="flex-row flex-wrap gap-2">
              <CopyButton copyText={data.commit.hash} variant="outline" accessibilityLabel="Copy commit SHA">
                <Icon
                  family="Feather"
                  name="copy"
                  size={18}
                  className="text-foreground"
                  accessible={false}
                />
                Copy SHA
              </CopyButton>
              {data.githubUrl ? (
              <Button
                variant="outline"
                accessibilityLabel="View commit on GitHub"
                onPress={() => { void openGitHub(); }}
              >
                <Icon
                  family="Feather"
                  name="github"
                  size={18}
                  className="text-foreground"
                  accessible={false}
                />
                View on GitHub
              </Button>
              ) : null}
            </View>

            <View className="flex-row flex-wrap items-center justify-between gap-3 pt-1">
              <PText className="text-base font-semibold">
                {formatProjectChangeCount(diff.summary.fileCount)} changed
              </PText>
              <ProjectWorkspaceDiffSummary summary={diff.summary} />
            </View>
          </View>
        ) : null
      }
      empty={
        <View
          className="flex-1 items-center justify-center gap-4 px-6 py-8"
          accessibilityLiveRegion="polite"
        >
          {!data && query.isFetching && !isPaused ? (
            <ActivityIndicator className="text-primary" accessible={false} />
          ) : null}
          <HeadingText
            accessibilityRole="header"
            className="text-center text-3xl"
          >
            {data
              ? "No file changes"
              : isPaused
                ? "Waiting for a connection…"
                : error && !query.isFetching
                  ? "Unable to load commit details"
                  : "Loading commit details…"}
          </HeadingText>
          <PText className="text-center text-base text-muted-foreground">
            {data
              ? "This commit has no file changes."
              : isPaused
                ? "Commit details will load when you reconnect."
                : error && !query.isFetching
                  ? error.message
                  : "Reading this commit’s details and file changes."}
          </PText>
          {!data && error && validParams && !query.isFetching && !isPaused ? (
            <Button accessibilityLabel="Retry commit details" onPress={refresh}>
              Try again
            </Button>
          ) : null}
        </View>
      }
    />
  );
};
