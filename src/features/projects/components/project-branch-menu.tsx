import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, {
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

import { ProjectGitError } from "../lib/git-errors";
import { Icon } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ActionSheet } from "@/components/ui/action-sheet";
import { CodeText } from "@/components/ui/text";
import { useProjectGitOperation } from "../hooks/use-project-git-operation";
import { useProjectGitRemote } from "../hooks/use-project-git-remote";
import { useProject } from "../hooks/use-project";
import { ProjectPublishForm } from "./project-publish-form";
import {
  formatProjectGitCount,
  formatProjectSyncAction,
} from "../lib/formatters";
import {
  formatProjectBranchLabel,
  formatProjectBranchSource,
} from "../lib/formatters";

const syncActions = [
  "push",
  "force-push",
  "pull",
  "pull-rebase",
  "fetch",
] as const;

const badgeTransition = LinearTransition.duration(240).reduceMotion(
  ReduceMotion.System,
);

type ProjectBranchMenuProps = {
  maxWidth: number;
  onChangeBranch: () => void;
};

export const ProjectBranchMenu = ({
  maxWidth,
  onChangeBranch,
}: ProjectBranchMenuProps) => {
  const {
    branch,
    branchSource,
    isBranchLoading,
    isCheckingOut,
    isCheckoutRecoveryRequired,
    retryCheckoutRecovery,
    projectId,
    isWorkspaceBusy,
    workspaceOperation,
    run,
    confirm,
  } = useProjectGitOperation();
  const git = useProjectGitRemote(projectId);
  const project = useProject(projectId);
  const connected =
    git.data?.hasRemote ?? Boolean(project.data?.githubRepositoryId);
  const canPublish =
    git.data?.hasRemote === false &&
    !git.error &&
    !project.isPending &&
    !project.error &&
    !isWorkspaceBusy;
  const notInitialized =
    git.error instanceof ProjectGitError &&
    git.error.code === "NOT_INITIALIZED";
  const showPublish =
    notInitialized ||
    (!git.error &&
      (git.data?.hasRemote === false || git.data?.headSha === null));
  const countsMatchBranch =
    !git.error && !isCheckingOut && git.data?.currentBranch === branch;
  const unpublishedBranch =
    countsMatchBranch &&
    git.data?.hasRemote === true &&
    git.data.upstream === null &&
    Boolean(git.data.headSha);
  const outgoing = countsMatchBranch ? git.data?.outgoing : null;
  const incoming = countsMatchBranch ? git.data?.incoming : null;
  const sync = (action: (typeof syncActions)[number]) => {
    const presentation = formatProjectSyncAction(action);
    void run(
      presentation.pending,
      async (assertCurrent) => {
        switch (action) {
          case "fetch":
            await git.gitFetch.mutateAsync();
            return "Remote branches refreshed.";
          case "push": {
            const result = await git.gitPush.mutateAsync({});
            return result.trackingUpdated
              ? "Changes pushed to GitHub."
              : "Changes pushed. Refresh to check branch tracking.";
          }
          case "force-push": {
            const fresh = await git.gitFetch.mutateAsync();
            assertCurrent();
            if (
              !(await confirm(
                "Force Push?",
                `Replace the remote history for ${fresh.currentBranch ?? "this branch"} with your local commits? Other collaborators may need to reconcile their work.`,
                "Force Push",
                true,
              ))
            )
              return null;
            assertCurrent();
            await git.gitPush.mutateAsync({
              force: true,
              expectedRemoteSha: fresh.upstreamSha,
            });
            return "Changes force-pushed to GitHub.";
          }
          case "pull":
          case "pull-rebase":
            await git.gitPull.mutateAsync({ rebase: action === "pull-rebase" });
            return action === "pull"
              ? "Remote changes pulled."
              : "Local commits rebased on remote changes.";
        }
      },
      {
        success: (message) => message,
        changesFiles: action === "pull" || action === "pull-rebase",
      },
    );
  };
  const label = formatProjectBranchLabel(branch, isBranchLoading);
  const loadingBranch = !branch && isBranchLoading;
  const [open, setOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const publishAfterDismiss = useRef(false);
  const switchAfterDismiss = useRef(false);

  return (
    <>
      <Animated.View layout={badgeTransition} style={{ maxWidth }}>
        <GlassSurface>
          <Pressable
            className="min-h-12 flex-row items-center gap-2 rounded-full px-3"
            accessibilityRole="button"
            accessibilityLabel={
              showPublish
                ? `Branch actions: ${notInitialized ? "Publish" : `${label}, Publish`}`
                : `Branch actions: ${label}, ${formatProjectGitCount(outgoing)} to push, ${formatProjectGitCount(incoming)} to pull`
            }
            accessibilityState={{ expanded: open, busy: isWorkspaceBusy }}
            accessibilityHint="Opens branch and sync actions"
            onPress={() => {
              setOpen(true);
            }}
          >
            {!notInitialized && (
              <>
                <Icon
                  family="Feather"
                  name={formatProjectBranchSource(branchSource ?? "local").icon}
                  size={20}
                  className="text-foreground"
                  accessible={false}
                />
                <Animated.View
                  layout={badgeTransition}
                  testID="branch-indicator"
                  accessibilityLiveRegion="polite"
                  style={{
                    maxWidth: Math.max(
                      40,
                      maxWidth - (showPublish ? 170 : 190),
                    ),
                  }}
                  className="min-w-0 shrink"
                >
                  {loadingBranch ? (
                    <ActivityIndicator
                      className="text-primary"
                      accessibilityLabel={label}
                    />
                  ) : (
                    <CodeText
                      className="text-lg font-medium text-foreground"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {label}
                    </CodeText>
                  )}
                </Animated.View>
              </>
            )}
            {!loadingBranch && (isWorkspaceBusy || git.isFetching) && (
              <ActivityIndicator
                className="text-primary"
                accessibilityLabel={
                  workspaceOperation ?? "Refreshing Git counts"
                }
              />
            )}
            <Animated.View
              layout={badgeTransition}
              className="shrink-0 flex-row items-center gap-2"
            >
              {!notInitialized && (
                <Icon
                  family="Octicons"
                  name="dot-fill"
                  size={8}
                  className="shrink-0 text-muted-foreground"
                  accessible={false}
                />
              )}
              <View className="shrink-0 flex-row items-center gap-1">
                <Icon
                  family="Feather"
                  name="arrow-up"
                  size={20}
                  className="text-foreground"
                  accessible={false}
                />
                <CodeText className="text-lg font-medium text-foreground">
                  {showPublish ? "Publish" : formatProjectGitCount(outgoing)}
                </CodeText>
                {!showPublish && (
                  <>
                    <Icon
                      family="Feather"
                      name="arrow-down"
                      size={20}
                      className="text-foreground"
                      accessible={false}
                    />
                    <CodeText className="text-lg font-medium text-foreground">
                      {formatProjectGitCount(incoming)}
                    </CodeText>
                  </>
                )}
                <Icon
                  family="Feather"
                  name="chevron-down"
                  size={20}
                  className="text-foreground"
                  accessible={false}
                />
              </View>
            </Animated.View>
          </Pressable>
        </GlassSurface>
      </Animated.View>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        monospaceTitle
        items={[
          {
            id: "publish",
            label: "Publish to GitHub",
            icon: "github",
            chevron: true,
            disabled: !canPublish,
            onPress: () => {
              publishAfterDismiss.current = true;
              setOpen(false);
            },
          },
          ...(unpublishedBranch
            ? [
                {
                  id: "publish-branch",
                  label: "Publish branch to GitHub",
                  icon: "upload" as const,
                  disabled: isWorkspaceBusy || isBranchLoading || !branch,
                  busy: workspaceOperation === "Publishing branch…",
                  onPress: () => {
                    void run(
                      "Publishing branch…",
                      async () => {
                        const result = await git.gitPush.mutateAsync({});
                        return result.trackingUpdated
                          ? "Branch published to GitHub."
                          : "Branch published. Refresh to check tracking.";
                      },
                      { success: (message) => message },
                    );
                  },
                },
              ]
            : []),
          ...syncActions.map((action) => ({
            id: action,
            ...formatProjectSyncAction(action),
            count:
              action === "push"
                ? outgoing
                : action === "pull"
                  ? incoming
                  : null,
            disabled:
              isWorkspaceBusy ||
              !connected ||
              !branch ||
              isBranchLoading ||
              (action === "push" && unpublishedBranch),
            busy:
              workspaceOperation === formatProjectSyncAction(action).pending,
            onPress: () => sync(action),
          })),
          ...(git.error
            ? [
                {
                  id: "retry-counts",
                  label: "Retry Git status",
                  icon: "refresh-cw" as const,
                  disabled: isWorkspaceBusy || git.isFetching,
                  onPress: () => {
                    void git.refetch();
                  },
                },
              ]
            : []),
          {
            id: "branch",
            label: isCheckoutRecoveryRequired
              ? "Retry branch recovery"
              : "Switch Branch",
            accessibilityLabel: isCheckoutRecoveryRequired
              ? "Recover branch from actions"
              : "Switch Branch",
            icon: "git-branch",
            chevron: true,
            disabled: isWorkspaceBusy && !isCheckoutRecoveryRequired,
            onPress: () => {
              switchAfterDismiss.current = true;
              setOpen(false);
            },
          },
        ]}
        onDismiss={() => {
          if (publishAfterDismiss.current) {
            publishAfterDismiss.current = false;
            if (canPublish) setPublishOpen(true);
          }
          // Present the picker only after the native actions sheet has finished closing.
          if (!switchAfterDismiss.current) return;
          switchAfterDismiss.current = false;
          if (isCheckoutRecoveryRequired) retryCheckoutRecovery();
          else if (!isWorkspaceBusy) onChangeBranch();
        }}
      />
      {publishOpen ? (
        <ProjectPublishForm
          key={projectId}
          open={publishOpen}
          onOpenChange={setPublishOpen}
          projectName={project.data?.name ?? ""}
          enabled={canPublish}
        />
      ) : null}
    </>
  );
};
