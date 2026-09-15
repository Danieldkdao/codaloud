import { useState } from "react";
import { Pressable } from "react-native";

import {
  ActionSheet,
  type ActionSheetItem,
} from "@/components/ui/action-sheet";
import { Icon } from "@/components/ui/icon";

// UI placeholders only: no stash, discard, or commit mutations are connected.
const otherActions: readonly ActionSheetItem[] = [
  { id: "stash-all", label: "Stash All", icon: "archive" },
  { id: "pop-stash", label: "Pop Stash", icon: "package" },
  { id: "view-stash", label: "View Stash", icon: "layers" },
  { id: "discard-changes", label: "Discard Changes", icon: "trash-2" },
  { id: "revert-last-commit", label: "Revert Last Commit", icon: "rotate-ccw" },
];

export const ProjectOtherOptions = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Other Options"
        accessibilityHint="Opens stash and other Git actions"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="size-12 items-center justify-center rounded-full active:bg-secondary"
      >
        <Icon
          family="MaterialCommunityIcons"
          name="tune-vertical"
          size={28}
          className="text-foreground"
          accessible={false}
        />
      </Pressable>
      <ActionSheet open={open} onOpenChange={setOpen} items={otherActions} />
    </>
  );
};
