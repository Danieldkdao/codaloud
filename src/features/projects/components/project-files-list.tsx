import type { ProjectFileEntrySchema, UpdateProjectFileSchema } from "@/features/projects/actions/file-schemas";
import { use } from "react";
import { ProjectWorkspaceDockHeightContext } from "@/features/projects/contexts/project-workspace-context";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProjectIcon } from "@/components/project-icon";
import { PText } from "@/components/ui/text";
import { ProjectWorkspacePlaceholder } from "@/features/projects/components/project-workspace-placeholder";
import { SandboxFiles } from "@/features/projects/components/sandbox-files";
import { ProjectFilesListItem } from "@/features/projects/components/project-files-list-item";

type ProjectFilesListProps = {
  files: ProjectFileEntrySchema[];
  existingNames: readonly string[];
  parentDirectory?: string;
  onDirectoryPress: (path: string) => void;
  onUpdate: (input: UpdateProjectFileSchema) => Promise<void>;
  updatingPath?: string;
  navigationDisabled?: boolean;
};

export const ProjectFilesList = ({
  files,
  existingNames,
  parentDirectory,
  onDirectoryPress,
  onUpdate,
  updatingPath,
  navigationDisabled = false,
}: ProjectFilesListProps) => {
  const insets = useSafeAreaInsets();
  const dockHeight = use(ProjectWorkspaceDockHeightContext);
  const contentPadding = {
    paddingTop: 8,
    paddingBottom: 16,
    paddingLeft: 16 + insets.left,
    paddingRight: 16 + insets.right,
  };
  const parentRow = parentDirectory !== undefined ? (
    <Pressable
      onPress={() => onDirectoryPress(parentDirectory)}
      disabled={navigationDisabled || Boolean(updatingPath)}
      accessibilityState={{ disabled: navigationDisabled || Boolean(updatingPath) }}
      accessibilityRole="button"
      accessibilityLabel="Go to parent directory"
      className="flex-row items-center gap-3 border-b border-border px-3 py-4 active:bg-secondary"
      style={{ minHeight: 56 }}
    >
      <ProjectIcon name=".." isDirectory />
      <PText className="flex-1 text-foreground text-lg font-medium">..</PText>
    </Pressable>
  ) : null;

  if (files.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {parentRow ? <View style={contentPadding}>{parentRow}</View> : null}
        <ProjectWorkspacePlaceholder title="Files" description="No files created">
          <SandboxFiles />
        </ProjectWorkspacePlaceholder>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={files}
      keyExtractor={(file) => file.path ?? file.name}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ ...contentPadding, paddingBottom: dockHeight + 24 }}
      scrollIndicatorInsets={{ bottom: dockHeight }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={parentRow}
      renderItem={({ item }) => (
        <ProjectFilesListItem
          file={item}
          existingNames={existingNames}
          onDirectoryPress={onDirectoryPress}
          onUpdate={onUpdate}
          disabled={navigationDisabled || Boolean(updatingPath && updatingPath !== item.path)}
        />
      )}
    />
  );
};
