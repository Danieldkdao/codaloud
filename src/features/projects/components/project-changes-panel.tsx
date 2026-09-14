import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { ProjectRepositoryChangeSchema } from "../actions/change-schemas";
import { useProjectChanges } from "../hooks/use-project-changes";
import { useProjectWorkspaceDockHeight } from "../hooks/use-project-workspace-dock-height";
import { useProjectWorkspaceChanges } from "../hooks/use-project-workspace-changes";
import { ProjectChangeCheckbox } from "./project-change-checkbox";
import { ProjectChangesGroup } from "./project-changes-group";
import { ProjectWorkspaceDiffSummary } from "./project-workspace-diff-summary";
import { createProjectWorkspaceDiff } from "../lib/workspace-diff";

type ProjectChangesPanelProps = {
  projectId: string;
  active?: boolean;
  onViewFullDiff?: () => void;
};

export const ProjectChangesPanel = ({ projectId, active = true, onViewFullDiff }: ProjectChangesPanelProps) => {
  const query = useProjectChanges(projectId, { enabled: active });
  const session = useAuthSession();
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const { setCommitSelection } = useProjectWorkspaceChanges();
  const insets = useSafeAreaInsets();
  const { data } = query;
  const diff = useMemo(() => data ? createProjectWorkspaceDiff(data) : undefined, [data]);
  const changes = data?.changes ?? [];
  // The history branch picker does not switch the checkout. Scope drafts and
  // selection to the actual snapshot and account instead of that picker.
  const scope = JSON.stringify([session.data?.user.id, projectId, data?.currentBranch, data?.headSha]);
  const [selection, setSelection] = useState<{ scope: string; paths: string[] }>({ scope, paths: [] });
  const availablePaths = new Set(changes.map((change) => change.path));
  const paths = selection.scope === scope ? selection.paths.filter((path) => availablePaths.has(path)) : [];
  if (selection.scope !== scope || paths.length !== selection.paths.length) {
    // Reconcile before children render, so removed files cannot silently become
    // selected again if a later poll brings them back.
    setSelection({ scope, paths });
  }
  const selectedPaths = new Set(paths);
  const tracked = changes.filter((change) => !change.isUntracked);
  const untracked = changes.filter((change) => change.isUntracked);
  const checked = paths.length === 0 ? false : paths.length === changes.length ? true : "mixed";
  const paused = query.fetchStatus === "paused";

  useEffect(() => {
    setCommitSelection({
      scope,
      selectedCount: paths.length,
      totalCount: changes.length,
    });
  }, [changes.length, paths.length, scope, setCommitSelection]);

  const toggleChanges = (items: ProjectRepositoryChangeSchema[]) => {
    const toggled = new Set(items.map((change) => change.path));
    setSelection((previous) => {
      const selected = previous.scope === scope ? previous.paths.filter((path) => availablePaths.has(path)) : [];
      return {
        scope,
        paths: items.every((change) => selected.includes(change.path))
          ? selected.filter((path) => !toggled.has(path))
          : [...new Set([...selected, ...toggled])],
      };
    });
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === "android" ? "height" : undefined}>
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1, paddingTop: 12, paddingLeft: 20 + insets.left,
          paddingRight: 20 + insets.right, paddingBottom: dockHeight + 24, gap: 20,
        }}
        scrollIndicatorInsets={{ bottom: dockHeight }}
      >
        {!data ? (
          <View className="flex-1 items-center justify-center gap-4 py-8" accessibilityLiveRegion="polite">
            {query.isFetching ? <ActivityIndicator className="text-primary" accessible={false} /> : null}
            <HeadingText accessibilityRole="header" className="text-center text-3xl">
              {paused ? "Waiting for a connection…" : query.error ? "Unable to load changes" : "Loading changes…"}
            </HeadingText>
            <PText className="text-center text-base text-muted-foreground">
              {paused ? "Changes will load when you reconnect." : query.error ? "We couldn’t read your workspace changes. Please try again." : "Reading the workspace’s current changes."}
            </PText>
            {query.error && !paused && !query.isFetching ? (
              <Button accessibilityLabel="Retry project changes" onPress={() => void query.refetch()}>Try again</Button>
            ) : null}
          </View>
        ) : (
          <>
            {paused || (query.error && !query.isFetching) ? (
              <View className="gap-2" accessibilityLiveRegion="polite">
                <PText className="text-base text-muted-foreground">
                  {paused ? "Waiting for a connection… Showing previously loaded changes." : "Couldn’t refresh changes. Showing previously loaded changes."}
                </PText>
                {query.error && !query.isFetching && !paused ? (
                  <Button variant="outline" accessibilityLabel="Retry project changes" onPress={() => void query.refetch()}>Try again</Button>
                ) : null}
              </View>
            ) : null}
            {changes.length > 0 ? (
              <>
                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-2 pr-4">
                    <ProjectChangeCheckbox checked={checked} label="Select all changes" className="ml-px px-4" onPress={() => toggleChanges(changes)}>
                      <PText className="text-base font-medium">All</PText>
                    </ProjectChangeCheckbox>
                    {diff ? <ProjectWorkspaceDiffSummary summary={diff.summary} onViewFullDiff={onViewFullDiff} /> : null}
                  </View>
                  <ProjectChangesGroup title="Tracked" label="Select tracked changes" changes={tracked} selectedPaths={selectedPaths} onToggleChanges={toggleChanges} />
                  <ProjectChangesGroup title="Untracked" label="Select untracked changes" changes={untracked} selectedPaths={selectedPaths} onToggleChanges={toggleChanges} />
                </View>
              </>
            ) : (
              <View className="flex-1 items-center justify-center gap-4 py-8">
                <HeadingText accessibilityRole="header" className="text-center text-3xl">
                  {data.repositoryState === "not-initialized" ? "Git is not initialized" : "No uncommitted changes"}
                </HeadingText>
                <PText className="max-w-sm text-center text-lg text-muted-foreground">
                  {data.repositoryState === "not-initialized" ? "Initialize a Git repository in this workspace to track changes." : "Changed and untracked files will appear here, ready for your next commit."}
                </PText>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
