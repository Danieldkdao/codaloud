import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { ProjectIcon } from "@/components/project-icon";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import type { ProjectFileEntrySchema } from "@/features/projects/actions/file-schemas";
import { ProjectFileNameRow } from "@/features/projects/components/project-file-name-row";
import { formatProjectFileDeletion } from "@/features/projects/lib/formatters";
import { confirmAction } from "@/lib/utils";

type ProjectFilesListItemProps = {
  file: ProjectFileEntrySchema;
  onDirectoryPress: (path: string) => void;
  disabled?: boolean;
};

export const ProjectFilesListItem = ({ file, onDirectoryPress, disabled = false }: ProjectFilesListItemProps) => {
  const swipeable = useRef<SwipeableMethods>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const kind = file.isDir ? "folder" : "file";

  useEffect(() => {
    if (disabled) {
      swipeable.current?.close();
      setIsUpdating(false);
    }
  }, [disabled]);

  const updateFile = () => {
    if (disabled) return;
    swipeable.current?.close();
    setActionsVisible(false);
    setIsUpdating(true);
  };

  const deleteFile = () => {
    if (disabled) return;
    swipeable.current?.close();
    const confirmation = formatProjectFileDeletion(kind, file.name);
    confirmAction(confirmation.title, confirmation.description, {
      actionText: "Delete",
      onConfirmPress: () => {
        // UI preview only; sandbox deletion will be connected separately.
      },
    });
  };

  if (isUpdating && !disabled) {
    return (
      <ProjectFileNameRow
        mode="update"
        kind={kind}
        initialName={file.name}
        parentPath={file.path.slice(0, Math.max(0, file.path.lastIndexOf("/")))}
        onCancel={() => setIsUpdating(false)}
        onSubmit={async () => {
          // UI preview only; preserve the server's file name until rename is wired.
          setIsUpdating(false);
        }}
      />
    );
  }

  return (
    <Swipeable
      ref={swipeable}
      enabled={!disabled}
      friction={2}
      rightThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => setActionsVisible(true)}
      onSwipeableWillClose={() => setActionsVisible(false)}
      renderRightActions={() => (
        <View
          className="h-full flex-row items-stretch"
          accessibilityElementsHidden={!actionsVisible || disabled}
          importantForAccessibility={actionsVisible && !disabled ? "auto" : "no-hide-descendants"}
        >
          <Button
            variant="secondary"
            className="h-full min-h-12 w-16 shrink-0 rounded-none p-0"
            accessibilityLabel={`Update ${file.name}`}
            disabled={disabled}
            onPress={updateFile}
          >
            <Icon family="Feather" name="edit-2" size={22} className="text-foreground" accessible={false} />
          </Button>
          <Button
            variant="destructive"
            className="h-full min-h-12 w-16 shrink-0 rounded-l-none rounded-r-2xl p-0"
            accessibilityLabel={`Delete ${file.name}`}
            disabled={disabled}
            onPress={deleteFile}
          >
            <Icon family="Feather" name="trash-2" size={22} className="text-destructive" accessible={false} />
          </Button>
        </View>
      )}
    >
      <Pressable
        onPress={file.isDir ? () => onDirectoryPress(file.path) : undefined}
        disabled={disabled}
        accessibilityState={{ disabled }}
        accessibilityRole="button"
        accessibilityLabel={`${file.name}, ${kind}`}
        accessibilityHint="Swipe left for Update and Delete."
        accessibilityActions={[
          { name: "update", label: `Update ${kind}` },
          { name: "delete", label: `Delete ${kind}` },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "update") updateFile();
          if (nativeEvent.actionName === "delete") deleteFile();
        }}
        className="flex-row items-center gap-3 border-b border-border bg-background px-3 py-4 active:bg-secondary"
        style={{ minHeight: 56 }}
      >
        <ProjectIcon name={file.path} isDirectory={file.isDir} />
        <PText className="flex-1 text-foreground text-lg font-medium" numberOfLines={1} ellipsizeMode="middle">
          {file.name}
        </PText>
      </Pressable>
    </Swipeable>
  );
};
