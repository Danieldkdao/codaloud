import { useLocalSearchParams } from "expo-router";
import { use, useCallback, useState } from "react";
import { View } from "react-native";

import CodeEditor from "@/components/code-editor";
import { CodeEditorLoading } from "@/components/code-editor-loading";
import { ProjectIcon } from "@/components/project-icon";
import { Button } from "@/components/ui/button";
import { CodeText, HeadingText, PText } from "@/components/ui/text";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { ProjectWorkspaceCurrentFileContext, ProjectWorkspaceDockHeightContext } from "@/features/projects/contexts/project-workspace-context";
import { useProjectFile } from "@/features/projects/hooks/use-project-file";
import { useEditorDevelopmentShortcuts } from "@/hooks/use-editor-development-shortcuts";
import { useTheme } from "@/hooks/use-theme";

const LoadedCodeEditor = ({ filePath, content, bottomInset }: {
  filePath: string;
  content: string;
  bottomInset: number;
}) => {
  const { isDarkMode } = useTheme();
  // Initialize once per opened file so query refreshes cannot overwrite local edits.
  const [initialValue] = useState(content);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const handleEditorReady = useCallback(async () => {
    setIsEditorReady(true);
  }, []);

  return (
    <View className="flex-1">
      <View
        className="flex-1"
        pointerEvents={isEditorReady ? "auto" : "none"}
        accessibilityElementsHidden={!isEditorReady}
        importantForAccessibility={isEditorReady ? "auto" : "no-hide-descendants"}
      >
        <CodeEditor
          colorScheme={isDarkMode ? "dark" : "light"}
          onReady={handleEditorReady}
          filename={filePath}
          initialValue={initialValue}
          bottomInset={bottomInset}
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
      {!isEditorReady ? <CodeEditorLoading bottomInset={bottomInset} /> : null}
    </View>
  );
};

const CodeScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const currentFile = use(ProjectWorkspaceCurrentFileContext);
  const filePath = currentFile?.filePath ?? null;
  const query = useProjectFile(projectId, filePath);
  const dockHeight = use(ProjectWorkspaceDockHeightContext);
  useEditorDevelopmentShortcuts();

  if (!filePath) {
    return (
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
        <ProjectIcon name={filePath} isDirectory={false} />
        <CodeText className="min-w-0 flex-1 text-foreground" numberOfLines={1} ellipsizeMode="middle">
          {filePath}
        </CodeText>
      </View>
      <View className="flex-1">
        {query.data ? (
          <LoadedCodeEditor
            key={`${projectId}/${filePath}`}
            filePath={filePath}
            content={query.data.content}
            bottomInset={dockHeight}
          />
        ) : query.isError ? (
          <View className="flex-1 items-center justify-center gap-4 px-6" style={{ paddingBottom: dockHeight }}>
            <HeadingText className="text-center text-2xl font-semibold">Couldn't open this file</HeadingText>
            <PText accessibilityRole="alert" className="max-w-100 text-center">{query.error.message}</PText>
            <Button variant="outline" disabled={query.isFetching} onPress={() => void query.refetch()}>
              {query.isFetching ? "Retrying…" : "Try again"}
            </Button>
          </View>
        ) : <CodeEditorLoading bottomInset={dockHeight} />}
      </View>
    </View>
  );
};

export default CodeScreen;
