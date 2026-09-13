import { useState } from "react";
import { FlatList, Keyboard, Pressable, ScrollView, View } from "react-native";

import { ProjectIcon } from "@/components/project-icon";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { formatProjectFileMatchCount, formatProjectFileSearchCount, formatProjectFileSearchPath } from "@/features/projects/lib/formatters";
import type { ProjectFileSearchDocument, ProjectFileSearchResult } from "@/features/projects/types";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ProjectFileSearchResultsProps = {
  results: ProjectFileSearchResult[];
};

export const ProjectFileSearchResults = ({ results }: ProjectFileSearchResultsProps) => {
  const [selectedFile, setSelectedFile] = useState<ProjectFileSearchDocument | null>(null);
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const insets = useSafeAreaInsets();
  const screenStyle = { paddingTop: 8, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right };

  if (selectedFile) {
    return (
      <View className="flex-1 bg-background" style={screenStyle}>
        <View className="flex-row items-center gap-2 border-b border-border pb-2">
          <Pressable onPress={() => setSelectedFile(null)} accessibilityRole="button" accessibilityLabel="Back to search results"
            className="size-12 items-center justify-center rounded-full active:bg-secondary">
            <Icon family="Feather" name="arrow-left" size={22} className="text-foreground" accessible={false} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <PText className="text-base font-semibold" numberOfLines={1} ellipsizeMode="middle">{formatProjectFileSearchPath(selectedFile.path).name}</PText>
          </View>
        </View>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingTop: 16, paddingBottom: dockHeight + 84 }} keyboardShouldPersistTaps="handled">
          <PText selectable className="text-base font-mono">{selectedFile.content}</PText>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={screenStyle}>
      <View className="border-b border-border px-3 pb-3">
        <PText className="text-base font-semibold" accessibilityLiveRegion="polite">{formatProjectFileSearchCount(results.length)}</PText>
      </View>
      <FlatList data={results} keyExtractor={({ file }) => file.path} automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: dockHeight + 84 }}
        scrollIndicatorInsets={{ bottom: dockHeight }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center gap-2 px-4 py-8">
            <Icon family="Feather" name="search" size={28} className="text-muted-foreground" accessible={false} />
            <PText className="text-lg font-medium">No matching files</PText>
            <PText className="text-center text-base text-muted-foreground">Try another search or change the filters.</PText>
          </View>
        }
        renderItem={({ item }) => {
          const { name, directory } = formatProjectFileSearchPath(item.file.path);
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={item.file.path}
              accessibilityHint="Opens file contents"
              onPress={() => { Keyboard.dismiss(); setSelectedFile(item.file); }}
              className="flex-row items-start gap-3 border-b border-border px-3 py-4 active:bg-secondary">
              <View className="pt-1"><ProjectIcon name={item.file.path} isDirectory={false} /></View>
              <View className="min-w-0 flex-1 gap-1">
                <PText className="text-lg font-medium" numberOfLines={1} ellipsizeMode="middle">{name}</PText>
                <PText className="text-base text-muted-foreground" numberOfLines={1} ellipsizeMode="middle">{directory}</PText>
                {item.contentMatchCount > 0 && <PText className="text-base text-muted-foreground">{formatProjectFileMatchCount(item.contentMatchCount)}</PText>}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
};
