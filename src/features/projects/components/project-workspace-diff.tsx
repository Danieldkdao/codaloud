import { FlatList, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CodeText, PText } from "@/components/ui/text";
import {
  formatProjectChangeCount,
  formatProjectChangeLines,
  formatProjectChangePath,
  formatProjectChangeStatus,
  formatProjectDiffLabel,
  formatProjectDiffLine,
} from "@/features/projects/lib/formatters";
import type { ProjectWorkspaceDiffFile } from "@/features/projects/types";
import { cn } from "@/lib/utils";

type ProjectWorkspaceDiffProps = {
  files: ProjectWorkspaceDiffFile[];
};

export const ProjectWorkspaceDiff = ({ files }: ProjectWorkspaceDiffProps) => {
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      className="flex-1 bg-background"
      accessibilityLabel="Full workspace diff"
      data={files}
      keyExtractor={(file) => file.path}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingLeft: insets.left, paddingRight: insets.right }}
      ListHeaderComponent={
        <PText className="px-4 py-3 text-base">{formatProjectChangeCount(files.length)}</PText>
      }
      renderItem={({ item: file }) => {
        const path = formatProjectChangePath(file.path);
        const lines = formatProjectChangeLines(file.additions, file.deletions);

        return (
          <View className="border-t border-border">
            <View className="gap-2 px-4 py-4">
              <CodeText selectable className="text-base font-semibold text-foreground">{path.name}</CodeText>
              <PText selectable className="text-base">{path.directory}</PText>
              <View className="flex-row flex-wrap items-center gap-3">
                <PText className="text-base font-medium text-foreground">{formatProjectChangeStatus(file.status)}</PText>
                <CodeText className="text-base text-success-foreground">{lines.additions}</CodeText>
                <CodeText className="text-base text-destructive">{lines.deletions}</CodeText>
              </View>
            </View>
            <ScrollView horizontal directionalLockEnabled
              accessibilityLabel={formatProjectDiffLabel(file.path)}
              contentContainerStyle={{ minWidth: "100%", paddingBottom: 12 }}>
              <View style={{ flexGrow: 1 }}>
                {file.patch.split("\n").map((line, index) => {
                  const presentation = formatProjectDiffLine(line);
                  return (
                    <CodeText key={index} selectable accessibilityLabel={presentation.label}
                      className={cn("px-4 py-1 text-base", presentation.className)}>{line || " "}</CodeText>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        );
      }}
    />
  );
};
