import { use, useCallback, useState } from "react";
import { View } from "react-native";

import CodeEditor from "@/components/code-editor";
import { CodeEditorLoading } from "@/components/code-editor-loading";
import { CodeText } from "@/components/ui/text";
import { useEditorDevelopmentShortcuts } from "@/hooks/use-editor-development-shortcuts";
import { demoCode, demoCodeFilename } from "@/features/projects/data/demo-code";
import { ProjectWorkspaceDockHeightContext } from "@/features/projects/contexts/project-workspace-context";
import { ProjectIcon } from "@/components/project-icon";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useWorkspaceLoadingPreview } from "@/features/projects/hooks/use-workspace-loading-preview";

const CodeScreen = () => {
  useEditorDevelopmentShortcuts();
  const isLoadingPreview = useWorkspaceLoadingPreview();
  const dockHeight = use(ProjectWorkspaceDockHeightContext);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const handleEditorReady = useCallback(async () => {
    setIsEditorReady(true);
  }, []);
  const isLoading = isLoadingPreview || !isEditorReady;

  if (!demoCodeFilename) {
    return isLoadingPreview ? (
      <CodeEditorLoading bottomInset={dockHeight} />
    ) : (
      <ProjectWorkspaceState
        icon="code"
        title="No file selected"
        description="Choose a file from the Files tab to start editing."
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="min-h-12 flex-row items-center gap-2.5 border-b border-border px-4 py-3">
        <ProjectIcon name={demoCodeFilename} isDirectory={false} />
        <CodeText className="min-w-0 flex-1 text-foreground" numberOfLines={1}>
          {demoCodeFilename}
        </CodeText>
      </View>
      <View className="flex-1">
        <View
          className="flex-1"
          pointerEvents={isLoading ? "none" : "auto"}
          accessibilityElementsHidden={isLoading}
          importantForAccessibility={
            isLoading ? "no-hide-descendants" : "auto"
          }
        >
          <CodeEditor
            onReady={handleEditorReady}
            filename={demoCodeFilename}
            initialValue={demoCode}
            bottomInset={dockHeight}
            dom={{
              onLoadStart: () => setIsEditorReady(false),
              style: { flex: 1 },
              containerStyle: { flex: 1 },
              scrollEnabled: true,
              bounces: false,
              contentInsetAdjustmentBehavior: "never",
              automaticallyAdjustContentInsets: false,
              hideKeyboardAccessoryView: false,
            }}
          />
        </View>
        {isLoading ? <CodeEditorLoading bottomInset={dockHeight} /> : null}
      </View>
    </View>
  );
};

export default CodeScreen;
