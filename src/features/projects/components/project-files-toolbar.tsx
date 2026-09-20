import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface } from "@/components/ui/glass-surface";
import { ProjectFilesAdd } from "@/features/projects/components/project-files-add";
import { ProjectWorkspaceFileSearch } from "@/features/projects/components/project-workspace-file-search";

export const ProjectFilesToolbar = () => {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="project-files-toolbar"
      className="flex-row items-center gap-3 bg-background"
      style={{
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingLeft: 16 + insets.left,
        paddingRight: 16 + insets.right,
      }}
    >
      <GlassSurface>
        <ProjectFilesAdd />
      </GlassSurface>
      <View className="min-w-0 flex-1">
        <GlassSurface>
          <ProjectWorkspaceFileSearch />
        </GlassSurface>
      </View>
    </View>
  );
};
