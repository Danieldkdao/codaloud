import { useRef, useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";

import {
  ActionSheet,
  type ActionSheetItem,
} from "@/components/ui/action-sheet";
import { Icon } from "@/components/ui/icon";

import { useProjectStashOperations } from "../hooks/use-project-stash-operations";
import { ProjectStashSheet } from "./project-stash-sheet";

// History and discard controls are connected in the next integration step.
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
  const [viewStashes, setViewStashes] = useState(false);
  const showStashesAfterDismiss = useRef(false);
  const { stashAll, pop, operation } = useProjectStashOperations();
  const items = otherActions.map((item) => {
    switch (item.id) {
      case "stash-all": return { ...item, disabled: operation.isWorkspaceBusy || !operation.branch, busy: operation.workspaceOperation === "Stashing changes…", onPress: () => { void stashAll(); } };
      case "pop-stash": return { ...item, disabled: operation.isWorkspaceBusy || !operation.branch, busy: operation.workspaceOperation === "Restoring stash…", onPress: () => { void pop(); } };
      case "view-stash": return { ...item, disabled: operation.isWorkspaceBusy, onPress: () => { showStashesAfterDismiss.current = true; setOpen(false); } };
      default: return { ...item, disabled: true };
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
        {operation.isWorkspaceBusy ? <ActivityIndicator className="text-primary" accessibilityLabel={operation.workspaceOperation ?? "Working…"} /> : <Icon
          family="MaterialCommunityIcons"
          name="tune-vertical"
          size={28}
          className="text-foreground"
          accessible={false}
        />}
      </Pressable>
      <ActionSheet open={open} onOpenChange={setOpen} items={items} onDismiss={() => {
        if (showStashesAfterDismiss.current) { showStashesAfterDismiss.current = false; setViewStashes(true); }
      }} />
      {viewStashes && <ProjectStashSheet onClose={() => setViewStashes(false)} />}
    </>
  );
};
