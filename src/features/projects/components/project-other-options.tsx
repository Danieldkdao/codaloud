import { useRef, useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";

import {
  ActionSheet,
  type ActionSheetItem,
} from "@/components/ui/action-sheet";
import { Icon } from "@/components/ui/icon";

import { useProjectStashOperations } from "../hooks/use-project-stash-operations";
import { ProjectStashSheet } from "./project-stash-sheet";

import { useProjectHistoryOperations } from "../hooks/use-project-history-operations";
import { ProjectGitResetSheet } from "./project-git-reset-sheet";
const otherActions: readonly ActionSheetItem[] = [
  { id: "stash-all", label: "Stash All", icon: "archive" },
  { id: "pop-stash", label: "Pop Stash", icon: "package" },
  { id: "view-stash", label: "View Stash", icon: "layers" },
  { id: "discard-changes", label: "Discard Changes", icon: "trash-2" },
  { id: "undo-last-commit", label: "Undo Last Commit", icon: "corner-up-left" },
  { id: "revert-last-commit", label: "Revert Last Commit", icon: "rotate-ccw" },
];

export const ProjectOtherOptions = () => {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"stash" | "undo" | "discard" | null>(null);
  const panelAfterDismiss = useRef<typeof panel>(null);
  const { revert } = useProjectHistoryOperations();
  const openPanel = (value: typeof panel) => {
    panelAfterDismiss.current = value;
    setOpen(false);
  };
  const { stashAll, pop, operation } = useProjectStashOperations();
  const items = otherActions.map((item) => {
    switch (item.id) {
      case "stash-all":
        return {
          ...item,
          disabled: operation.isWorkspaceBusy || !operation.branch,
          busy: operation.workspaceOperation === "Stashing changes…",
          onPress: () => {
            void stashAll();
          },
        };
      case "pop-stash":
        return {
          ...item,
          disabled: operation.isWorkspaceBusy || !operation.branch,
          busy: operation.workspaceOperation === "Restoring stash…",
          onPress: () => {
            void pop();
          },
        };
      case "view-stash":
        return {
          ...item,
          disabled: operation.isWorkspaceBusy,
          onPress: () => openPanel("stash"),
        };
      case "discard-changes":
        return {
          ...item,
          disabled: operation.isWorkspaceBusy || !operation.branch,
          onPress: () => openPanel("discard"),
        };
      case "undo-last-commit":
        return {
          ...item,
          disabled: operation.isWorkspaceBusy || !operation.branch,
          onPress: () => openPanel("undo"),
        };
      case "revert-last-commit":
        return {
          ...item,
          disabled: operation.isWorkspaceBusy || !operation.branch,
          busy: operation.workspaceOperation === "Reverting last commit…",
          onPress: () => {
            void revert();
          },
        };
      default:
        return { ...item, disabled: true };
    }
  });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Other Options"
        accessibilityHint="Opens stash and other Git actions"
        accessibilityState={{ expanded: open, busy: operation.isWorkspaceBusy }}
        onPress={() => setOpen(true)}
        className="size-12 items-center justify-center rounded-full active:bg-secondary"
      >
        {operation.isWorkspaceBusy ? (
          <ActivityIndicator
            className="text-primary"
            accessibilityLabel={operation.workspaceOperation ?? "Working…"}
          />
        ) : (
          <Icon
            family="MaterialCommunityIcons"
            name="tune-vertical"
            size={28}
            className="text-foreground"
            accessible={false}
          />
        )}
      </Pressable>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        items={items}
        onDismiss={() => {
          if (panelAfterDismiss.current) {
            setPanel(panelAfterDismiss.current);
            panelAfterDismiss.current = null;
          }
        }}
      />
      {panel === "stash" && (
        <ProjectStashSheet onClose={() => setPanel(null)} />
      )}
      {(panel === "undo" || panel === "discard") && (
        <ProjectGitResetSheet kind={panel} onClose={() => setPanel(null)} />
      )}
    </>
  );
};
