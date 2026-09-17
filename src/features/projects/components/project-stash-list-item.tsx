import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { formatCommitTimestamp, formatProjectStashLabel } from "../lib/formatters";
import type { GitStashListSchema } from "../server/git-stash-schemas";

type ProjectStashListItemProps = {
  stash: GitStashListSchema["stashes"][number];
  disabled: boolean;
  onSelect: () => void;
  onDelete: () => Promise<unknown>;
};

export const ProjectStashListItem = ({ stash, disabled, onSelect, onDelete }: ProjectStashListItemProps) => {
  const swipeable = useRef<SwipeableMethods>(null);
  const deleting = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const isDisabled = disabled || isDeleting;
  useEffect(() => { if (isDisabled) swipeable.current?.close(); }, [isDisabled]);

  const remove = async () => {
    if (disabled || deleting.current) return;
    deleting.current = true;
    setIsDeleting(true);
    swipeable.current?.close();
    try {
      await onDelete();
    } finally {
      deleting.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <Swipeable
      ref={swipeable}
      enabled={!isDisabled}
      friction={2}
      leftThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => setActionsVisible(true)}
      onSwipeableWillClose={() => setActionsVisible(false)}
      renderLeftActions={() => (
        <View
          className="h-full"
          accessibilityElementsHidden={!actionsVisible || isDisabled}
          importantForAccessibility={actionsVisible && !isDisabled ? "auto" : "no-hide-descendants"}
        >
          <Button
            variant="destructive"
            className="h-full min-h-12 rounded-none px-5"
            accessibilityLabel={`Delete stash: ${stash.message}`}
            disabled={isDisabled}
            onPress={() => { void remove(); }}
          >
            <Icon family="Feather" name="trash-2" size={22} className="text-destructive" accessible={false} />
            Delete
          </Button>
        </View>
      )}
    >
      <Pressable
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={formatProjectStashLabel(stash.index)}
        accessibilityHint="Opens the stash. Swipe right to reveal Delete."
        accessibilityState={{ disabled: isDisabled, busy: isDeleting }}
        accessibilityActions={[{ name: "delete", label: "Delete stash" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "delete") void remove();
        }}
        onPress={onSelect}
        className="flex-row items-center gap-3 border-b border-border px-5 py-4 active:bg-secondary disabled:opacity-40"
      >
        <View className="min-w-0 flex-1 gap-1">
          <PText className="text-xl font-medium">{stash.message}</PText>
          <PText className="text-lg text-muted-foreground">{formatCommitTimestamp(stash.createdAt)}</PText>
        </View>
        {isDeleting && <ActivityIndicator className="text-destructive" accessibilityLabel="Deleting stash" />}
      </Pressable>
    </Swipeable>
  );
};
