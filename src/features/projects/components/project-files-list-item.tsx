import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { ProjectIcon } from "@/components/project-icon";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import type {
  DeleteProjectFileSchema,
  ProjectFileEntrySchema,
  UpdateProjectFileSchema,
} from "@/features/projects/actions/file-schemas";
import { ProjectFileNameRow } from "@/features/projects/components/project-file-name-row";
import { formatProjectFileDeletion } from "@/features/projects/lib/formatters";
import { confirmAction } from "@/lib/utils";
import { useSwipePressGuard } from "@/hooks/use-swipe-press-guard";

type ProjectFilesListItemProps = {
  file: ProjectFileEntrySchema;
  existingNames: readonly string[];
  onDirectoryPress: (path: string) => void;
  onFilePress: (path: string) => void;
  onUpdate: (input: UpdateProjectFileSchema) => Promise<void>;
  onDelete: (input: DeleteProjectFileSchema) => Promise<void>;
  disabled?: boolean;
  deleting?: boolean;
};

export const ProjectFilesListItem = ({
  file,
  existingNames,
  onDirectoryPress,
  onFilePress,
  onUpdate,
  onDelete,
  disabled = false,
  deleting = false,
}: ProjectFilesListItemProps) => {
  const swipeable = useRef<SwipeableMethods>(null);
  const pressGuard = useSwipePressGuard({ allowPressDuringSettling: true });
  const [actionsVisible, setActionsVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const isDisabled = disabled || deleting;
  const kind = file.isDir ? "folder" : "file";

  useEffect(() => {
    if (isDisabled) {
      swipeable.current?.close();
      setIsUpdating(false);
    }
  }, [isDisabled]);

  const updateFile = () => {
    if (isDisabled) return;
    swipeable.current?.close();
    setActionsVisible(false);
    setIsUpdating(true);
  };

  const deleteFile = () => {
    if (isDisabled) return;
    swipeable.current?.close();
    const confirmation = formatProjectFileDeletion(kind, file.name);
    confirmAction(confirmation.title, confirmation.description, {
      actionText: "Delete",
      onConfirmPress: () => {
        void onDelete({
          parentPath: file.path.slice(
            0,
            Math.max(0, file.path.lastIndexOf("/")),
          ),
          name: file.name,
          kind,
        });
      },
    });
  };

  if (isUpdating && !isDisabled) {
    return (
      <ProjectFileNameRow
        mode="update"
        kind={kind}
        initialName={file.name}
        existingNames={existingNames}
        parentPath={file.path.slice(0, Math.max(0, file.path.lastIndexOf("/")))}
        onCancel={() => {
          pressGuard.onSettleEnd();
          setIsUpdating(false);
        }}
        onSubmit={async (input) => {
          if (input.name !== file.name)
            await onUpdate({ ...input, previousName: file.name });
          pressGuard.onSettleEnd();
          setIsUpdating(false);
        }}
      />
    );
  }

  return (
    <View className="relative" {...pressGuard.touchHandlers}>
      <View
        pointerEvents={deleting ? "none" : "auto"}
        accessibilityElementsHidden={deleting}
        importantForAccessibility={deleting ? "no-hide-descendants" : "auto"}
      >
        <Swipeable
          ref={swipeable}
          enabled={!isDisabled}
          friction={2}
          rightThreshold={48}
          overshootLeft={false}
          overshootRight={false}
          onSwipeableOpenStartDrag={pressGuard.onDrag}
          onSwipeableCloseStartDrag={pressGuard.onDrag}
          onSwipeableWillOpen={() => {
            pressGuard.onSettleStart();
            setActionsVisible(true);
          }}
          onSwipeableWillClose={() => {
            pressGuard.onSettleStart();
            setActionsVisible(false);
          }}
          onSwipeableOpen={pressGuard.onSettleEnd}
          onSwipeableClose={pressGuard.onSettleEnd}
          renderRightActions={() => (
            <View
              className="h-full flex-row items-stretch"
              accessibilityElementsHidden={!actionsVisible || isDisabled}
              importantForAccessibility={
                actionsVisible && !isDisabled ? "auto" : "no-hide-descendants"
              }
            >
              <Button
                variant="secondary"
                className="h-full min-h-12 w-16 shrink-0 rounded-none p-0"
                accessibilityLabel={`Update ${file.name}`}
                disabled={isDisabled}
                onPress={() => {
                  if (!pressGuard.shouldSuppressPress()) updateFile();
                }}
              >
                <Icon
                  family="Feather"
                  name="edit-2"
                  size={22}
                  className="text-foreground"
                  accessible={false}
                />
              </Button>
              <Button
                variant="destructive"
                className="h-full min-h-12 w-16 shrink-0 rounded-l-none rounded-r-2xl p-0"
                accessibilityLabel={`Delete ${file.name}`}
                disabled={isDisabled}
                onPress={() => {
                  if (!pressGuard.shouldSuppressPress()) deleteFile();
                }}
              >
                <Icon
                  family="Feather"
                  name="trash-2"
                  size={22}
                  className="text-destructive"
                  accessible={false}
                />
              </Button>
            </View>
          )}
        >
          <Pressable
            onPress={() => {
              if (isDisabled || pressGuard.shouldSuppressPress()) return;
              if (file.isDir) onDirectoryPress(file.path);
              else onFilePress(file.path);
            }}
            disabled={isDisabled}
            accessibilityState={{ disabled: isDisabled, busy: deleting }}
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
            <PText
              className="flex-1 text-foreground text-lg font-medium"
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {file.name}
            </PText>
          </Pressable>
        </Swipeable>
      </View>
      {deleting && (
        <View
          className="absolute inset-0 items-center justify-center bg-background/70"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Deleting ${file.name}`}
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator
            size="large"
            className="text-primary"
            accessible={false}
          />
        </View>
      )}
    </View>
  );
};
