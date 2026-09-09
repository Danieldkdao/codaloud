import type { FileInfo } from "@daytona/sdk";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProjectIcon } from "@/components/project-icon";
import { PText } from "@/components/ui/text";
import { ProjectWorkspacePlaceholder } from "@/features/projects/components/project-workspace-placeholder";
import { SandboxFiles } from "@/features/projects/components/sandbox-files";

type ProjectFilesListProps = {
  files: FileInfo[];
  parentDirectory?: string;
  onDirectoryPress: (path: string) => void;
};

export const ProjectFilesList = ({
  files,
  parentDirectory,
  onDirectoryPress,
}: ProjectFilesListProps) => {
  const insets = useSafeAreaInsets();
  const contentPadding = {
    paddingTop: 8,
    paddingBottom: 16,
    paddingLeft: 16 + insets.left,
    paddingRight: 16 + insets.right,
  };
  const parentRow = parentDirectory ? (
    <Pressable
      onPress={() => onDirectoryPress(parentDirectory)}
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
      contentContainerStyle={contentPadding}
      ListHeaderComponent={parentRow}
      renderItem={({ item }) => (
        <Pressable
          onPress={item.isDir ? () => {
            if (item.path) onDirectoryPress(item.path);
          } : undefined}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.isDir ? "folder" : "file"}`}
          className="flex-row items-center gap-3 border-b border-border px-3 py-4 active:bg-secondary"
          style={{ minHeight: 56 }}
        >
          <ProjectIcon name={item.path ?? item.name} isDirectory={item.isDir} />
          <PText
            className="flex-1 text-foreground text-lg font-medium"
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {item.name}
          </PText>
        </Pressable>
      )}
    />
  );
};
