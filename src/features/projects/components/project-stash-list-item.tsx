import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import {
  formatCommitTimestamp,
  formatProjectStashLabel,
} from "../lib/formatters";
import type { GitStashListSchema } from "../server/git-stash-schemas";

type ProjectStashListItemProps = {
  stash: GitStashListSchema["stashes"][number];
  disabled: boolean;
  onSelect: () => void;
  onDelete: () => Promise<unknown>;
};

const deleteActionWidth = 128;
const closedOffset = { x: deleteActionWidth, y: 0 };
const snapOffsets = [0, deleteActionWidth, deleteActionWidth * 2];

export const ProjectStashListItem = ({
  stash,
  disabled,
  onSelect,
  onDelete,
}: ProjectStashListItemProps) => {
  const { width } = useWindowDimensions();
  const scrollView = useRef<ScrollView>(null);
  const deleting = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [visibleAction, setVisibleAction] = useState<"left" | "right" | null>(null);
  const isDisabled = disabled || isDeleting;
  const close = () => {
    scrollView.current?.scrollTo({ ...closedOffset, animated: true });
    setVisibleAction(null);
  };
  useEffect(() => {
    if (isDisabled) {
      scrollView.current?.scrollTo({ ...closedOffset, animated: false });
      setVisibleAction(null);
    }
  }, [isDisabled]);

  const remove = async () => {
    if (disabled || deleting.current) return;
    deleting.current = true;
    setIsDeleting(true);
    close();
    try {
      await onDelete();
    } finally {
      deleting.current = false;
      setIsDeleting(false);
    }
  };

  const renderDelete = (side: "left" | "right") => (
    <View
      style={{ width: deleteActionWidth }}
      accessibilityElementsHidden={visibleAction !== side || isDisabled}
      importantForAccessibility={
        visibleAction === side && !isDisabled ? "auto" : "no-hide-descendants"
      }
    >
      <Button
        variant="destructive"
        className="flex-1 rounded-none px-3"
        accessibilityLabel={`Delete stash: ${stash.message}`}
        disabled={isDisabled}
        onPress={() => {
          void remove();
        }}
      >
        <Icon
          family="Feather"
          name="trash-2"
          size={22}
          className="text-destructive"
          accessible={false}
        />
        Delete
      </Button>
    </View>
  );

  return (
    // Native scrolling works inside RNHostView's separate touch root. RNGH's
    // iOS root discovery does not recognize the SwiftUI sheet's view controller.
    <ScrollView
      ref={scrollView}
      horizontal
      style={{ width, flexGrow: 0 }}
      contentOffset={closedOffset}
      contentInsetAdjustmentBehavior="never"
      snapToOffsets={snapOffsets}
      decelerationRate="fast"
      disableIntervalMomentum
      directionalLockEnabled
      nestedScrollEnabled
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      scrollEnabled={!isDisabled}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={({ nativeEvent }) => {
        const offset = nativeEvent.contentOffset.x;
        if (isDisabled) setVisibleAction(null);
        else if (offset < deleteActionWidth - 1) setVisibleAction("left");
        else if (offset > deleteActionWidth + 1) setVisibleAction("right");
        else setVisibleAction(null);
      }}
    >
      {renderDelete("left")}
      <Pressable
        style={{ width }}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={formatProjectStashLabel(stash.index)}
        accessibilityHint="Asks to restore this stash. Swipe left or right to reveal Delete."
        accessibilityState={{ disabled: isDisabled, busy: isDeleting }}
        accessibilityActions={[{ name: "delete", label: "Delete stash" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "delete") void remove();
        }}
        onPress={() => {
          close();
          onSelect();
        }}
        className="flex-row items-center gap-3 border-b border-border px-5 py-4 active:bg-secondary disabled:opacity-40"
      >
        <View className="min-w-0 flex-1 gap-1">
          <PText className="text-xl font-medium">{stash.message}</PText>
          <PText className="text-lg text-muted-foreground">
            {formatCommitTimestamp(stash.createdAt)}
          </PText>
        </View>
        {isDeleting && (
          <ActivityIndicator
            className="text-destructive"
            accessibilityLabel="Deleting stash"
          />
        )}
      </Pressable>
      {renderDelete("right")}
    </ScrollView>
  );
};
