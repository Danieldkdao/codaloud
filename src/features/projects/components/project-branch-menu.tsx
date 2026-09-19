import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, {
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { ActionSheet } from "@/components/ui/action-sheet";
import { CodeText } from "@/components/ui/text";
import { useProjectGitOperation } from "../hooks/use-project-git-operation";
import { useProjectGitRemote } from "../hooks/use-project-git-remote";
import { useProject } from "../hooks/use-project";
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
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
  const connected = Boolean(project.data?.githubRepositoryId);
  const countsMatchBranch =
    !git.error && !isCheckingOut && git.data?.currentBranch === branch;
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
  const switchAfterDismiss = useRef(false);

  return (
    <>
      <AnimatedPressable
        layout={badgeTransition}
        style={{ maxWidth }}
        className="min-h-12 flex-row items-center gap-2 overflow-hidden rounded-full border border-border bg-secondary px-3"
        accessibilityRole="button"
        accessibilityLabel={`Branch actions: ${label}, ${formatProjectGitCount(outgoing)} to push, ${formatProjectGitCount(incoming)} to pull`}
        accessibilityState={{ expanded: open, busy: isWorkspaceBusy }}
        accessibilityHint="Opens branch and sync actions"
        onPress={() => {
          setOpen(true);
        }}
      >
        <Icon
          family="Feather"
          name={formatProjectBranchSource(branchSource ?? "local").icon}
          size={20}
          className="text-secondary-foreground"
          accessible={false}
        />
        <Animated.View
          layout={badgeTransition}
          testID="branch-indicator"
          accessibilityLiveRegion="polite"
          style={{ maxWidth: Math.max(40, maxWidth - 190) }}
          className="min-w-0 shrink"
        >
          {loadingBranch ? (
            <ActivityIndicator
              className="text-primary"
              accessibilityLabel={label}
            />
          ) : (
            <CodeText
              className="text-lg font-medium text-secondary-foreground"
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {label}
            </CodeText>
          )}
        </Animated.View>
        {!loadingBranch && (isWorkspaceBusy || git.isFetching) && (
          <ActivityIndicator
            className="text-primary"
            accessibilityLabel={workspaceOperation ?? "Refreshing Git counts"}
          />
        )}
        <Animated.View
          layout={badgeTransition}
          className="shrink-0 flex-row items-center gap-2"
        >
          <Icon
            family="Entypo"
            name="dot-single"
            size={14}
            className="shrink-0 text-secondary-foreground"
            accessible={false}
          />
          <View className="shrink-0 flex-row items-center gap-1">
            <Icon
              family="Feather"
              name="arrow-up"
              size={20}
              className="text-secondary-foreground"
              accessible={false}
            />
            <CodeText className="text-lg font-medium text-secondary-foreground">
              {formatProjectGitCount(outgoing)}
            </CodeText>
            <Icon
              family="Feather"
              name="arrow-down"
              size={20}
              className="text-secondary-foreground"
              accessible={false}
            />
            <CodeText className="text-lg font-medium text-secondary-foreground">
              {formatProjectGitCount(incoming)}
            </CodeText>
            <Icon
              family="Feather"
              name="chevron-down"
              size={20}
              className="text-secondary-foreground"
              accessible={false}
            />
          </View>
        </Animated.View>
      </AnimatedPressable>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        monospaceTitle
        items={[
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
              isWorkspaceBusy || !connected || !branch || isBranchLoading,
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
          // Present the picker only after the native actions sheet has finished closing.
          if (!switchAfterDismiss.current) return;
          switchAfterDismiss.current = false;
          if (isCheckoutRecoveryRequired) retryCheckoutRecovery();
          else if (!isWorkspaceBusy) onChangeBranch();
        }}
      />
    </>
  );
};
