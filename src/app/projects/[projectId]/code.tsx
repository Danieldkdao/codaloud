import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";

import CodeEditor from "@/components/code-editor";
import { CodeEditorLoading } from "@/components/code-editor-loading";
import { ProjectCodeHeader } from "@/features/projects/components/project-code-header";
import { readProjectCodeIntelligence } from "@/features/projects/actions/code-intelligence-actions";
import type { CodeEditorAnalysis, CodeEditorAnalysisRequest } from "@/components/code-editor-intelligence";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { useProjectFile } from "@/features/projects/hooks/use-project-file";
import { useEditorDevelopmentShortcuts } from "@/hooks/use-editor-development-shortcuts";
import { useTheme } from "@/hooks/use-theme";

const LoadedCodeEditor = ({ projectId, filePath, content, bottomInset }: {
  projectId: string;
  filePath: string;
  content: string;
  bottomInset: number;
}) => {
  const { isDarkMode } = useTheme();
  // Initialize once per opened file so query refreshes cannot overwrite local edits.
  const [initialValue] = useState(content);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [analysis, setAnalysis] = useState<CodeEditorAnalysis>({ status: "checking", diagnostics: [] });
  const [analysisPanelRequest, setAnalysisPanelRequest] = useState(0);
  const handleAnalysis = useCallback(async (value: CodeEditorAnalysis) => { setAnalysis(value); }, []);
  const requestAnalysis = useCallback<CodeEditorAnalysisRequest>(async (input) =>
    readProjectCodeIntelligence(projectId, { ...input, path: filePath }), [projectId, filePath]);
  const handleEditorReady = useCallback(async () => {
    setIsEditorReady(true);
  }, []);

  return (
    <View className="flex-1">
      <ProjectCodeHeader filePath={filePath} analysis={analysis} onShowProblems={() => setAnalysisPanelRequest((value) => value + 1)} />
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
            onRequestAnalysis={requestAnalysis}
            onAnalysis={handleAnalysis}
            analysisPanelRequest={analysisPanelRequest}
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
    </View>
  );
};

const CodeScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const currentFile = useProjectWorkspaceCurrentFile();
  const filePath = currentFile.filePath;
  const query = useProjectFile(projectId, filePath);
  const { dockHeight } = useProjectWorkspaceDockHeight();
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
      {!query.data ? <ProjectCodeHeader filePath={filePath} /> : null}
      <View className="flex-1">
        {query.data ? (
          <LoadedCodeEditor
            key={`${projectId}/${filePath}/${currentFile.version}`}
            projectId={projectId}
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
