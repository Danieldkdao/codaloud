import { useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { ActionSheet } from "@/components/ui/action-sheet";
import { CodeText } from "@/components/ui/text";
import { useProjectWorkspaceBranch } from "../hooks/use-project-workspace-branch";
import {
  formatProjectBranchLabel,
  formatProjectBranchSource,
} from "../lib/formatters";

// UI previews only; these counts do not describe the repository's actual state.
const mockPushCount = 1;
const mockPullCount = 1;
const syncActions = [
  "push",
  "force-push",
  "pull",
  "pull-rebase",
  "fetch",
] as const;

const formatSyncAction = (action: (typeof syncActions)[number]) => {
  switch (action) {
    case "push":
      return { label: "Push", count: mockPushCount, icon: "upload" as const };
    case "force-push":
      return { label: "Force Push", count: null, icon: "chevrons-up" as const };
    case "pull":
      return { label: "Pull", count: mockPullCount, icon: "download" as const };
    case "pull-rebase":
      return { label: "Pull Rebase", count: null, icon: "git-merge" as const };
    case "fetch":
      return { label: "Fetch", count: null, icon: "download-cloud" as const };
  }
};

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
  } = useProjectWorkspaceBranch();
  const label = formatProjectBranchLabel(branch, isBranchLoading);
  const [open, setOpen] = useState(false);
  const switchAfterDismiss = useRef(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Branch actions: ${label}, ${mockPushCount} to push, ${mockPullCount} to pull`}
        accessibilityState={{ expanded: open }}
        accessibilityHint="Opens branch and sync actions"
        onPress={() => {
          setOpen(true);
        }}
      >
        <View
          style={{ maxWidth }}
          className="min-h-12 flex-row items-center gap-2 rounded-full border border-border bg-secondary px-3"
        >
          <Icon
            family="Feather"
            name={formatProjectBranchSource(branchSource ?? "local").icon}
            size={20}
            className="text-secondary-foreground"
            accessible={false}
          />
          <View
            testID="branch-indicator"
            accessibilityLiveRegion="polite"
            style={{ maxWidth: Math.max(40, maxWidth - 190) }}
            className="min-w-0 shrink"
          >
            <CodeText
              className="text-lg font-medium text-secondary-foreground"
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {label}
            </CodeText>
          </View>
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
              {mockPushCount}
            </CodeText>
            <Icon
              family="Feather"
              name="arrow-down"
              size={20}
              className="text-secondary-foreground"
              accessible={false}
            />
            <CodeText className="text-lg font-medium text-secondary-foreground">
              {mockPullCount}
            </CodeText>
            <Icon
              family="Feather"
              name="chevron-down"
              size={20}
              className="text-secondary-foreground"
              accessible={false}
            />
          </View>
        </View>
      </Pressable>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        monospaceTitle
        items={[
          ...syncActions.map((action) => ({ id: action, ...formatSyncAction(action) })),
          {
            id: "branch",
            label: isCheckoutRecoveryRequired ? "Retry branch recovery" : "Switch Branch",
            accessibilityLabel: isCheckoutRecoveryRequired ? "Recover branch from actions" : "Switch Branch",
            icon: "git-branch",
            chevron: true,
            disabled: isCheckingOut && !isCheckoutRecoveryRequired,
            onPress: () => { switchAfterDismiss.current = true; setOpen(false); },
          },
        ]}
        onDismiss={() => {
          // Present the picker only after the native actions sheet has finished closing.
          if (!switchAfterDismiss.current) return;
          switchAfterDismiss.current = false;
          if (isCheckoutRecoveryRequired) retryCheckoutRecovery();
          else if (!isCheckingOut) onChangeBranch();
        }}
      />
    </>
  );
};
