import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import CodeEditor, { type CodeEditorRef } from "@/components/code-editor";
import { CodeEditorLoading } from "@/components/code-editor-loading";
import type { CodeEditorAnalysis, CodeEditorAnalysisRequest } from "@/components/code-editor-intelligence";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { ProjectCodeTabs } from "@/features/projects/components/project-code-tabs";
import { ProjectCodeStatus } from "@/features/projects/components/project-code-status";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { readProjectCodeIntelligence } from "@/features/projects/actions/code-intelligence-actions";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { useProjectFile } from "@/features/projects/hooks/use-project-file";
import { useProjectEditorDocuments } from "@/features/projects/hooks/use-project-editor-documents";
import { useEditorDevelopmentShortcuts } from "@/hooks/use-editor-development-shortcuts";
import { useTheme } from "@/hooks/use-theme";

const CodeScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const files = useProjectWorkspaceCurrentFile();
  const query = useProjectFile(projectId, files.activeFilePath);
  const documents = useProjectEditorDocuments(files, query.data?.content);
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const { isWorkspaceBusy } = useProjectWorkspaceBranch();
  const { isDarkMode } = useTheme();
  const editor = useRef<CodeEditorRef>(null);
  const current = useRef({ files, documents });
  current.current = { files, documents };
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const closing = useRef(false);
  const [closingPath, setClosingPath] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState<string>();
  const [analysis, setAnalysis] = useState<{ key?: string; value: CodeEditorAnalysis }>();
  const [analysisPanelRequest, setAnalysisPanelRequest] = useState(0);
  const [badgeHeight, setBadgeHeight] = useState(48);
  useEditorDevelopmentShortcuts();

  const isReady = Boolean(documents.activeKey && readyKey === documents.activeKey);
  const bottomInset = dockHeight + badgeHeight + 20;
  const activeAnalysis = analysis?.key === documents.activeKey ? analysis?.value : { status: "checking" as const, diagnostics: [] };
  const onReady = useCallback(async (key?: string) => { setReadyKey(key ?? current.current.documents.activeKey); }, []);
  const onAnalysis = useCallback(async (value: CodeEditorAnalysis, key?: string) => {
    const source = key ?? current.current.documents.activeKey;
    if (source === current.current.documents.activeKey) setAnalysis({ key: source, value });
  }, []);
  const requestAnalysis = useCallback<CodeEditorAnalysisRequest>((input) => readProjectCodeIntelligence(projectId, input), [projectId]);
  const openFile = () => router.navigate({ pathname: "/projects/[projectId]/files", params: { projectId } });
  const closeFile = async (path: string) => {
    if (closing.current || isWorkspaceBusy) return;
    closing.current = true;
    setClosingPath(path);
    const version = files.getFileVersion(path);
    try {
      // Drain the asynchronous WebView bridge before confirming cloud durability.
      await editor.current?.flushChanges();
      await documents.flushFile(path);
      if (alive.current && current.current.files.getFileVersion(path) === version) current.current.files.closeFile(path);
    } catch (error) {
      if (alive.current) {
        current.current.files.openFile(path);
        Alert.alert("Couldn't close this file", error instanceof Error ? error.message : "Save your changes and try again.");
      }
    } finally {
      closing.current = false;
      if (alive.current) setClosingPath(null);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ProjectCodeTabs paths={files.openFilePaths} activePath={files.activeFilePath} onSelect={files.openFile}
        onClose={(path) => { void closeFile(path); }} onOpenFile={openFile} disabled={isWorkspaceBusy} closingPath={closingPath} />
      <View className="flex-1">
        {/* Keep one WebView mounted through loading and file switches. CodeMirror
            keeps each open document's selection and undo state inside that view. */}
        {documents.editor ? (
          <View className="absolute inset-0" style={{ opacity: isReady ? 1 : 0 }} pointerEvents={isReady ? "auto" : "none"}
            accessibilityElementsHidden={!isReady} importantForAccessibility={isReady ? "auto" : "no-hide-descendants"}>
            <CodeEditor ref={editor} documentKey={documents.editor.key} openDocumentKeys={documents.openDocumentKeys}
              filename={documents.editor.path} initialValue={documents.editor.initialValue}
              readOnly={isWorkspaceBusy || !documents.activeKey || Boolean(closingPath)}
              colorScheme={isDarkMode ? "dark" : "light"} onReady={onReady} onChange={documents.onChange}
              onRequestAnalysis={requestAnalysis} onAnalysis={onAnalysis} analysisPanelRequest={analysisPanelRequest}
              bottomInset={bottomInset}
              dom={{ onLoadStart: () => setReadyKey(undefined), style: { flex: 1 }, containerStyle: { flex: 1 },
                scrollEnabled: true, bounces: false, contentInsetAdjustmentBehavior: "never", automaticallyAdjustContentInsets: false, hideKeyboardAccessoryView: false }} />
          </View>
        ) : null}
        {!files.activeFilePath ? (
          <View className="flex-1" style={{ paddingBottom: dockHeight }}>
            <ProjectWorkspaceState icon="code" title="No file selected" description="Choose a file from the Files tab to start editing." />
          </View>
        ) : !documents.activeKey && query.isError ? (
          <View className="flex-1 items-center justify-center gap-4 px-6" style={{ paddingBottom: bottomInset }}>
            <HeadingText className="text-center text-2xl font-semibold">Couldn't open this file</HeadingText>
            <PText accessibilityRole="alert" className="max-w-100 text-center">{query.error.message}</PText>
            <Button variant="outline" disabled={query.isFetching} onPress={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Try again"}</Button>
          </View>
        ) : !isReady ? <CodeEditorLoading bottomInset={bottomInset} /> : null}
      </View>
      {files.activeFilePath ? (
        <View className="absolute left-4 right-4 items-center" style={{ bottom: dockHeight + 8 }} pointerEvents="box-none">
          <View onLayout={({ nativeEvent }) => setBadgeHeight(nativeEvent.layout.height)}>
            <ProjectCodeStatus status={isReady ? documents.status : { status: "loading" }} analysis={activeAnalysis}
              onRetry={documents.retry} onShowProblems={() => setAnalysisPanelRequest((value) => value + 1)} />
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default CodeScreen;
