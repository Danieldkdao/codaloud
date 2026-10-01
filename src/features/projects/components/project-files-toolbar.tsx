import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface } from "@/components/ui/glass-surface";
import { ProjectFilesAdd } from "@/features/projects/components/project-files-add";
import { useProjectWorkspaceFileCreation } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { ProjectWorkspaceFileSearch } from "@/features/projects/components/project-workspace-file-search";
import { useCommandBubbleAnchor } from "@/features/voice/hooks/use-command-bubble-layout";

export const ProjectFilesToolbar = ({
  commandScope,
}: {
  commandScope?: string;
}) => {
  const insets = useSafeAreaInsets();
  const { naming } = useProjectWorkspaceFileCreation();
  const anchor = useCommandBubbleAnchor(commandScope, !naming);

  // A file name is being typed here or in a rename row, so the search field and
  // the add button would read as controls the user never opened.
  if (naming) return null;

  return (
    <View
      {...anchor}
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
