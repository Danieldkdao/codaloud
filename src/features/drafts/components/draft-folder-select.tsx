import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { ProjectIcon } from "@/components/project-icon";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";
import { getDirectoryFiles } from "@/features/projects/lib/files";

export type DraftFolderSelectProps = {
  projectId: string;
  directoryPath: string;
  disabled?: boolean;
  onDirectoryChange: (path: string) => void;
  onChoose: () => void;
  onBackToProjects: () => void;
};

export const DraftFolderSelect = ({
  projectId,
  directoryPath,
  disabled = false,
  onDirectoryChange,
  onChoose,
  onBackToProjects,
}: DraftFolderSelectProps) => {
  const { height } = useWindowDimensions();
  const { query } = useProjectFiles(projectId, directoryPath);
  const folders = useMemo(
    () =>
      getDirectoryFiles(query.data ?? [], directoryPath).filter(
        (entry) => entry.isDir,
      ),
    [query.data, directoryPath],
  );
  const parentPath =
    directoryPath === ""
      ? null
      : directoryPath.slice(0, Math.max(0, directoryPath.lastIndexOf("/")));

  return (
    <View collapsable={false} className="min-h-0 shrink gap-3">
      <View className="items-center">
        <PText
          numberOfLines={1}
          ellipsizeMode="middle"
          accessibilityLabel={`Current folder ${directoryPath || "root"}`}
          className="text-center text-lg font-medium text-foreground"
        >
          {directoryPath === "" ? "Project root" : directoryPath}
        </PText>
      </View>

      {query.isPending ? (
        <View className="items-center gap-3 py-8">
          <ActivityIndicator className="text-primary" accessible={false} />
          <PText>Loading folders…</PText>
        </View>
      ) : query.isError ? (
        <View className="items-center gap-3 py-8">
          <PText
            accessibilityRole="alert"
            className="text-center text-destructive"
          >
            {query.error.message}
          </PText>
          <Button variant="outline" onPress={() => void query.refetch()}>
            Try again
          </Button>
        </View>
      ) : folders.length === 0 ? (
        <PText className="py-4 text-center text-lg text-muted-foreground">
          This folder has no subfolders.
        </PText>
      ) : (
        <ScrollView
          style={{
            flexGrow: 0,
            flexShrink: 1,
            maxHeight: Math.min(height * 0.4, 360),
          }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8 }}
        >
          {folders.map((folder) => (
            <Pressable
              key={folder.path}
              accessibilityRole="button"
              accessibilityLabel={`Open ${folder.name}`}
              accessibilityHint="Open this folder to choose a deeper destination"
              disabled={disabled}
              onPress={() => onDirectoryChange(folder.path)}
              className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
            >
              <ProjectIcon name={folder.name} isDirectory />
              <HeadingText
                className="min-w-0 flex-1 text-xl font-medium text-card-foreground"
                numberOfLines={1}
              >
                {folder.name}
              </HeadingText>
              <Icon
                family="Feather"
                name="chevron-right"
                size={20}
                accessible={false}
                className="text-muted-foreground"
              />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Button disabled={disabled || query.isPending} onPress={onChoose}>
        Copy into this folder
      </Button>
      {parentPath !== null ? (
        <Button
          variant="outline"
          disabled={disabled}
          onPress={() => onDirectoryChange(parentPath)}
        >
          Go back to previous folder
        </Button>
      ) : null}
      <Button variant="ghost" disabled={disabled} onPress={onBackToProjects}>
        Choose another project
      </Button>
    </View>
  );
};
