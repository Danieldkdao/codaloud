import { registerAgentWorkspace } from "@/features/agent/workspace-access";
import { useVoiceEditor } from "@/features/voice/hooks/use-voice-editor";
import { inlineAcceptanceOperation } from "@/features/voice/constants";
import { EditorBottomBar } from "@/features/editor/components/editor-bottom-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { WorkspaceVoiceContext } from "@/features/voice/hooks/workspace-voice-provider";
import { VoiceMicrophone } from "@/features/voice/components/voice-microphone";
import { createEditorFlush } from "@/features/editor/flush";
import { EditorProblemsSheet } from "@/features/editor/components/editor-problems-sheet";
import { EditorSearchBar } from "@/features/editor/components/editor-search-bar";
import type {
  EditorSearchQuery,
  EditorSearchSummary,
} from "@/features/editor/types";
import * as Clipboard from "expo-clipboard";
import type { EditorCommand } from "@/features/editor/types";
import { Alert, View } from "react-native";
import CodeEditor, {
  type CodeEditorRef,
  type CodeEditorInteraction,
} from "@/components/code-editor";
import { CodeEditorLoading } from "@/components/code-editor-loading";
import type {
  CodeEditorAnalysis,
  CodeEditorAnalysisRequest,
} from "@/components/code-editor-intelligence";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { ProjectCodeTabs } from "@/features/projects/components/project-code-tabs";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ProjectCodeSelectionMenu } from "@/features/projects/components/project-code-selection-menu";
import { ProjectCodeKeyboardAccessory } from "@/features/projects/components/project-code-keyboard-accessory";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { ProjectCodeToolbar } from "@/features/projects/components/project-code-toolbar";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { readProjectCodeIntelligence } from "@/features/projects/actions/code-intelligence-actions";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { useProjectFile } from "@/features/projects/hooks/use-project-file";
import { useProjectEditorDocuments } from "@/features/projects/hooks/use-project-editor-documents";
import { useEditorDevelopmentShortcuts } from "@/hooks/use-editor-development-shortcuts";
import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import { useTheme } from "@/hooks/use-theme";

const InlineVoiceControls = lazy(async () => ({
  default: (await import("@/features/voice/components/inline-voice-controls"))
    .InlineVoiceControls,
}));
const CodeScreen = () => {
  const conversation = useContext(WorkspaceVoiceContext);
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const files = useProjectWorkspaceCurrentFile();
  const query = useProjectFile(projectId, files.activeFilePath);
  const documents = useProjectEditorDocuments(files, query.data?.content);
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const { isWorkspaceBusy, branch, workspaceOperation, runWorkspaceOperation } =
    useProjectWorkspaceBranch();
  const editorBusy =
    isWorkspaceBusy && workspaceOperation !== inlineAcceptanceOperation;
  const { isDarkMode } = useTheme();
  const { preferences } = useEditorPreferences();
  const editor = useRef<CodeEditorRef>(null);
  const voiceEditor = useVoiceEditor({
    projectId,
    branch,
    busy: editorBusy,
    activePath: files.activeFilePath,
    documentKey: documents.activeKey,
    editor,
    getOpenFiles: documents.getOpenFiles,
    runWorkspaceOperation,
  });
  const voiceEditorRef = useRef(voiceEditor);
  voiceEditorRef.current = voiceEditor;
  const [editorFlush] = useState(() =>
    createEditorFlush((requestId) => {
      if (!editor.current?.flushChanges) throw new Error("Editor not ready");
      void editor.current.flushChanges(requestId);
    }),
  );
  useEffect(() => () => editorFlush.dispose(), [editorFlush]);
  const current = useRef({ files, documents });
  current.current = { files, documents };
  useEffect(
    () =>
      registerAgentWorkspace(projectId, async () => {
        if (current.current.files.activeFilePath) await editorFlush.flush();
        for (const path of current.current.files.openFilePaths)
          await current.current.documents.flushFile(path);
      }),
    [projectId, editorFlush],
  );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const closing = useRef(false);
  const [closingPath, setClosingPath] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState<string>();
  const [analysis, setAnalysis] = useState<{
    key?: string;
    value: CodeEditorAnalysis;
  }>();
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<EditorSearchQuery>({
    search: "",
  });
  const [searchSummary, setSearchSummary] = useState<EditorSearchSummary>();
  useEffect(() => {
    setSearchOpen(false);
    setSearchSummary(undefined);
  }, [documents.activeKey]);
  const keyboardFrame = useKeyboardFrame();
  const [interaction, setInteraction] = useState<
    CodeEditorInteraction & { key?: string }
  >();
  const onInteractionChange = useCallback(
    async (state: CodeEditorInteraction, key?: string) => {
      voiceEditorRef.current.onInteraction(state, key);
      if (key === current.current.documents.activeKey)
        setInteraction({ ...state, key });
    },
    [],
  );
  const runCommand = useCallback(
    (command: EditorCommand, text?: string) => {
      if (!documents.activeKey || isWorkspaceBusy || closing.current) return;
      editor.current?.command(command, text ?? "", documents.activeKey);
    },
    [documents.activeKey, isWorkspaceBusy],
  );
  const [badgeHeight, setBadgeHeight] = useState(48);
  const [voiceAccessoryHeight, setVoiceAccessoryHeight] = useState(160);
  useEditorDevelopmentShortcuts();

  const isReady = Boolean(
    documents.activeKey && readyKey === documents.activeKey,
  );
  const canShowEditorControls =
    isReady &&
    !isWorkspaceBusy &&
    !closingPath &&
    interaction?.key === documents.activeKey;
  useEffect(() => {
    if (documents.activeKey && documents.status.status === "error")
      Alert.alert(
        "Couldn't save this file",
        documents.status.message ??
          "Your changes are still in the editor. Try saving again.",
        [
          { text: "Later", style: "cancel" },
          { text: "Try again", onPress: documents.retry },
        ],
      );
  }, [
    documents.activeKey,
    documents.status.status,
    documents.status.message,
    documents.retry,
  ]);
  const showKeyboardAccessory = Boolean(
    canShowEditorControls &&
    !searchOpen &&
    keyboardFrame &&
    interaction?.focused,
  );
  const showSelectionMenu = Boolean(
    canShowEditorControls && interaction?.hasSelection,
  );
  const bottomInset = dockHeight + badgeHeight + 20;
  const activeAnalysis =
    analysis?.key === documents.activeKey
      ? analysis?.value
      : { status: "checking" as const, diagnostics: [] };
  const onReady = useCallback(async (key?: string) => {
    if (key && key === current.current.documents.activeKey) setReadyKey(key);
  }, []);
  const onAnalysis = useCallback(
    async (value: CodeEditorAnalysis, key?: string) => {
      const source = key ?? current.current.documents.activeKey;
      if (source === current.current.documents.activeKey)
        setAnalysis({ key: source, value });
    },
    [],
  );
  const requestAnalysis = useCallback<CodeEditorAnalysisRequest>(
    (input) => readProjectCodeIntelligence(projectId, input),
    [projectId],
  );
  const openFile = () =>
    router.navigate({
      pathname: "/projects/[projectId]/files",
      params: { projectId },
    });
  const closeFile = async (path: string) => {
    if (closing.current || isWorkspaceBusy) return;
    closing.current = true;
    setClosingPath(path);
    const version = files.getFileVersion(path);
    try {
      // Native imperative methods are fire-and-forget; wait for the DOM acknowledgement.
      await editorFlush.flush();
      await documents.flushFile(path);
      if (
        alive.current &&
        current.current.files.getFileVersion(path) === version
      )
        current.current.files.closeFile(path);
    } catch (error) {
      if (
        alive.current &&
        current.current.files.getFileVersion(path) === version &&
        current.current.files.openFilePaths.has(path)
      ) {
        current.current.files.openFile(path);
        Alert.alert(
          "Couldn't close this file",
          error instanceof Error
            ? error.message
            : "Save your changes and try again.",
        );
      }
    } finally {
      closing.current = false;
      if (alive.current) setClosingPath(null);
    }
  };

  const toolbar = (
    <ProjectCodeToolbar
      onProblems={() => setProblemsOpen(true)}
      disabled={!isReady || isWorkspaceBusy || Boolean(closingPath)}
      onFormat={() => {
        if (documents.activeKey)
          editor.current?.transform("format", documents.activeKey);
      }}
      onOrganize={() => {
        if (documents.activeKey)
          editor.current?.transform("organize-imports", documents.activeKey);
      }}
      onFind={() => {
        setReplaceOpen(false);
        setSearchOpen(true);
      }}
      onUndo={() => runCommand("undo")}
      onRedo={() => runCommand("redo")}
      canUndo={Boolean(canShowEditorControls && interaction?.commands?.canUndo)}
      canRedo={Boolean(canShowEditorControls && interaction?.commands?.canRedo)}
      analysis={documents.activeKey ? activeAnalysis : undefined}
    />
  );

  return (
    <View className="flex-1 bg-background">
      <EditorProblemsSheet
        open={problemsOpen}
        onOpenChange={setProblemsOpen}
        analysis={activeAnalysis}
        onSelect={(diagnostic) => {
          setProblemsOpen(false);
          if (documents.activeKey && activeAnalysis?.revision !== undefined)
            editor.current?.revealDiagnostic(
              diagnostic.from,
              diagnostic.to,
              activeAnalysis.revision,
              documents.activeKey,
            );
        }}
      />
      {files.openFilePaths.size > 0 ? (
        <ProjectCodeTabs
          key={projectId}
          projectId={projectId}
          paths={[...files.openFilePaths]}
          activePath={files.activeFilePath}
          onSelect={files.openFile}
          onClose={(path) => {
            void closeFile(path);
          }}
          onOpenFile={openFile}
          disabled={isWorkspaceBusy}
          closingPath={closingPath}
          save={
            documents.activeKey
              ? documents.status
              : query.isError && !query.isFetching
                ? { status: "error", message: query.error.message }
                : { status: "loading" }
          }
          onRetry={
            documents.activeKey ? documents.retry : () => void query.refetch()
          }
          readError={!documents.activeKey && query.isError}
        />
      ) : null}
      <View className="flex-1">
        {/* Warm the WebView before the first file read, then reuse it for every
            document. The empty editor stays hidden, read-only, and unfocused. */}
        <View
          className="absolute inset-0"
          style={{ opacity: isReady ? 1 : 0 }}
          pointerEvents={isReady ? "auto" : "none"}
          accessibilityElementsHidden={!isReady}
          importantForAccessibility={isReady ? "auto" : "no-hide-descendants"}
        >
          <CodeEditor
            onContext={voiceEditor.onContext}
            onSuggestionAction={voiceEditor.onSuggestionAction}
            onSuggestionApplied={voiceEditor.onSuggestionApplied}
            ref={editor}
            preferences={preferences}
            searchQuery={searchOpen ? searchQuery : undefined}
            onSearchSummary={async (summary, key) => {
              if (key === current.current.documents.activeKey)
                setSearchSummary(summary);
            }}
            onFlushed={async (requestId, error) => {
              editorFlush.acknowledge(requestId, error);
            }}
            onCommandError={async (message) => {
              Alert.alert("Couldn’t complete editor action", message);
            }}
            onReadClipboard={Clipboard.getStringAsync}
            onWriteClipboard={async (text) => {
              if (!(await Clipboard.setStringAsync(text)))
                throw new Error("Couldn’t write to the clipboard.");
            }}
            documentKey={documents.editor?.key ?? `prewarm/${projectId}`}
            openDocumentKeys={documents.openDocumentKeys}
            filename={documents.editor?.path ?? ""}
            initialValue={documents.editor?.initialValue ?? ""}
            readOnly={
              editorBusy || !documents.activeKey || Boolean(closingPath)
            }
            colorScheme={isDarkMode ? "dark" : "light"}
            onReady={onReady}
            onChange={documents.onChange}
            onRequestAnalysis={requestAnalysis}
            onAnalysis={onAnalysis}
            bottomInset={bottomInset}
            keyboardAccessoryHeight={
              showKeyboardAccessory ? voiceAccessoryHeight : 0
            }
            onInteractionChange={onInteractionChange}
            dom={{
              onLoadStart: () => {
                editorFlush.dispose();
                setReadyKey(undefined);
              },
              style: { flex: 1 },
              containerStyle: { flex: 1 },
              scrollEnabled: true,
              bounces: false,
              contentInsetAdjustmentBehavior: "never",
              automaticallyAdjustContentInsets: false,
              hideKeyboardAccessoryView: true,
            }}
          />
        </View>
        {!files.activeFilePath ? (
          <ProjectWorkspaceState
            centerInWindow
            icon="code"
            title="No file selected"
            description="Open a file to start editing."
            action={<Button onPress={openFile}>Open file</Button>}
          />
        ) : !documents.activeKey && query.isError ? (
          <View
            className="flex-1 items-center justify-center gap-4 px-6"
            style={{ paddingBottom: bottomInset }}
          >
            <HeadingText className="text-center text-2xl font-semibold">
              Couldn't open this file
            </HeadingText>
            <PText accessibilityRole="alert" className="max-w-100 text-center">
              {query.error.message}
            </PText>
            <Button
              variant="outline"
              disabled={query.isFetching}
              onPress={() => void query.refetch()}
            >
              {query.isFetching ? "Retrying…" : "Try again"}
            </Button>
          </View>
        ) : !isReady ? (
          <CodeEditorLoading bottomInset={bottomInset} />
        ) : null}
      </View>
      {files.activeFilePath && (searchOpen || !keyboardFrame) ? (
        <EditorBottomBar
          frame={searchOpen ? keyboardFrame : undefined}
          dockHeight={dockHeight}
          onHeight={setBadgeHeight}
        >
          {searchOpen ? (
            <EditorSearchBar
              query={searchQuery}
              summary={searchSummary}
              replace={replaceOpen}
              onReplaceChange={setReplaceOpen}
              onChange={setSearchQuery}
              onClose={() => {
                setSearchOpen(false);
                if (documents.activeKey)
                  editor.current?.focus(documents.activeKey);
              }}
              onCommand={(command) => {
                if (documents.activeKey && !isWorkspaceBusy)
                  editor.current?.searchCommand(
                    command,
                    searchQuery,
                    documents.activeKey,
                  );
              }}
            />
          ) : (
            toolbar
          )}
        </EditorBottomBar>
      ) : null}
      {showKeyboardAccessory ? (
        <ProjectCodeKeyboardAccessory
          status={toolbar}
          voiceActive={Boolean(conversation?.visible)}
          onHeight={setVoiceAccessoryHeight}
          voice={
            conversation ? (
              <VoiceMicrophone conversation={conversation} compact />
            ) : null
          }
          feedback={
            conversation ? (
              <Suspense fallback={null}>
                <InlineVoiceControls conversation={conversation} />
              </Suspense>
            ) : null
          }
          frame={keyboardFrame}
          onCommand={runCommand}
          canComment={interaction?.commands?.canComment}
          fold={interaction?.commands?.fold}
          onDismissKeyboard={() => editor.current?.dismissKeyboard()}
        >
          {showSelectionMenu ? (
            <ProjectCodeSelectionMenu
              onCommand={runCommand}
              commands={interaction?.commands}
            />
          ) : null}
        </ProjectCodeKeyboardAccessory>
      ) : showSelectionMenu && !keyboardFrame ? (
        <View className="absolute right-4 top-16">
          <GlassSurface borderRadius={24}>
            <ProjectCodeSelectionMenu
              onCommand={runCommand}
              commands={interaction?.commands}
            />
          </GlassSurface>
        </View>
      ) : null}
    </View>
  );
};

export default CodeScreen;
