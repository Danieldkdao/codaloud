import { use, useCallback, useState } from "react";
import { View } from "react-native";

import CodeEditor from "@/components/code-editor";
import { CodeEditorLoading } from "@/components/code-editor-loading";
import { Icon } from "@/components/ui/icon";
import { CodeText, PText } from "@/components/ui/text";
import { useEditorDevelopmentShortcuts } from "@/hooks/use-editor-development-shortcuts";
import { demoCode, demoCodeFilename } from "@/features/projects/data/demo-code";
import { ProjectWorkspaceDockHeightContext } from "@/features/projects/contexts/project-workspace-context";
import { ProjectIcon } from "@/components/project-icon";

const CodeScreen = () => {
  useEditorDevelopmentShortcuts();
  const dockHeight = use(ProjectWorkspaceDockHeightContext);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const handleEditorReady = useCallback(async () => {
    setIsEditorReady(true);
  }, []);

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
          pointerEvents={isEditorReady ? "auto" : "none"}
          accessibilityElementsHidden={!isEditorReady}
          importantForAccessibility={
            isEditorReady ? "auto" : "no-hide-descendants"
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
        {!isEditorReady ? <CodeEditorLoading bottomInset={dockHeight} /> : null}
      </View>
    </View>
  );
};

export default CodeScreen;
