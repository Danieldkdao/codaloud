import { EditorExplanationBubble } from "@/features/editor/components/editor-explanation-bubble";
import { useEditorExplanation } from "@/features/editor/hooks/use-editor-explanation";
import Animated, {
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { enterGlassSurface, exitGlassSurface } from "@/lib/glass-animations";
import { registerAgentWorkspace } from "@/features/agent/workspace-access";
import { useVoiceEditor } from "@/features/voice/hooks/use-voice-editor";
import { inlineAcceptanceOperation } from "@/features/voice/constants";
import { EditorBottomBar } from "@/features/editor/components/editor-bottom-bar";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { Alert, View, useWindowDimensions } from "react-native";
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
import type { DraftInsertMode } from "@/features/drafts/constants";
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
import { useQueryClient } from "@tanstack/react-query";
import { isProjectImagePath } from "@/features/projects/lib/image-files";
import { ProjectImagePreviewContent } from "@/features/projects/components/project-image-preview-content";
import { getCodeFileType } from "@/features/code-intelligence/file-type";
import { registerCommandTerminal } from "@/features/voice/command-navigation";

// The sheet reads the drafts table, so it stays out of the editor's first graph.
const DraftInsertSheet = lazy(async () => ({
  default: (await import("@/features/drafts/components/draft-insert-sheet"))
    .DraftInsertSheet,
}));
const TerminalPanel = lazy(async () => ({
  default: (await import("@/features/terminal/components/terminal-panel"))
    .TerminalPanel,
}));
const CodeScreen = () => {
  const conversation = useContext(WorkspaceVoiceContext);
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const files = useProjectWorkspaceCurrentFile();
  const activeImagePath =
    files.activeFilePath && isProjectImagePath(files.activeFilePath)
      ? files.activeFilePath
      : null;
  const textPath = activeImagePath ? null : files.activeFilePath;
  const query = useProjectFile(projectId, textPath);
  const documents = useProjectEditorDocuments(
    { ...files, activeFilePath: textPath },
    query.data?.content,
  );
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
    activePath: textPath,
    documentKey: documents.activeKey,
    editor,
    getOpenFiles: documents.getOpenFiles,
    runWorkspaceOperation,
  });
  const voiceEditorRef = useRef(voiceEditor);
  voiceEditorRef.current = voiceEditor;
  // The native flush is a script injection whose result the platform discards,
  // so a lost injection is re-sent instead of burning one long timeout.
  const [editorFlush] = useState(() =>
    createEditorFlush(
      (requestId) => {
        if (!editor.current?.flushChanges) throw new Error("Editor not ready");
        void editor.current.flushChanges(requestId);
      },
      { attempts: 3, timeout: 1700 },
    ),
  );
  useEffect(() => () => editorFlush.dispose(), [editorFlush]);
  const current = useRef({ files, documents });
  current.current = { files, documents };
  useEffect(
    () =>
      registerAgentWorkspace(projectId, async () => {
        if (current.current.documents.activeKey) await editorFlush.flush();
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
  const initialRevisions = useRef(new Map<string, number>());
  const explanation = useEditorExplanation({
    editor,
    documentKey: documents.activeKey,
    path: files.activeFilePath,
    revision:
      interaction?.key === documents.activeKey
        ? interaction?.revision
        : undefined,
    enabled:
      Boolean(documents.activeKey && readyKey === documents.activeKey) &&
      !editorBusy &&
      !closingPath &&
      !conversation?.visible &&
      !interaction?.inlineSuggestionId,
  });
  useFocusEffect(
    useCallback(() => () => explanation.close(), [explanation.close]),
  );
  const { height: screenHeight } = useWindowDimensions();
  const onInteractionChange = useCallback(
    async (state: CodeEditorInteraction, key?: string) => {
      voiceEditorRef.current.onInteraction(state, key);
      if (
        key &&
        typeof state.revision === "number" &&
        !initialRevisions.current.has(key)
      )
        initialRevisions.current.set(key, state.revision);
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
  const [insertOpen, setInsertOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  useEffect(
    () => registerCommandTerminal(projectId, setTerminalOpen),
    [projectId],
  );
  const [terminalHeight, setTerminalHeight] = useState(260);
  const refreshAfterTerminalSync = useCallback(
    (changes: { downloaded: string[]; deleted: string[] }) => {
      const downloaded = new Set(changes.downloaded);
      const deleted = new Set(changes.deleted);
      const openPaths = [...current.current.files.openFilePaths];
      for (const path of openPaths)
        if (deleted.has(path)) current.current.files.removeFiles(path);
      void (async () => {
        for (const path of openPaths.filter((path) => downloaded.has(path))) {
          await queryClient.refetchQueries({
            queryKey: ["projects", "file", projectId, path],
            type: "active",
          });
          current.current.files.refreshFile(path);
        }
        await queryClient.invalidateQueries({
          queryKey: ["projects", "files", projectId],
        });
      })();
    },
    [projectId, queryClient],
  );
  const [insertTarget, setInsertTarget] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const insertRequest = useRef<string | null>(null);
  const openInsertFromDraft = useCallback(() => {
    if (!documents.activeKey || isWorkspaceBusy || closing.current) return;
    // The sheet needs the caret or selection at the moment it opens, so ask the
    // DOM editor for one snapshot instead of trusting a possibly stale mirror.
    insertRequest.current = `insert:${documents.activeKey}`;
    setInsertTarget(null);
    editor.current?.captureContext(insertRequest.current);
    setInsertOpen(true);
  }, [documents.activeKey, isWorkspaceBusy]);
  const applyDraftInsert = useCallback(
    async (text: string, mode: DraftInsertMode) => {
      const key = documents.activeKey;
      const path = files.activeFilePath;
      if (!key || !path)
        throw new Error("Open a file before inserting a draft.");
      runCommand(
        mode === "after-selection" ? "insert-after-selection" : "insert",
        text,
      );
      // The insert lands in the DOM first; flush both hops so the sheet can
      // promise the project file was really written before offering deletion.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await editorFlush.flush();
      await documents.flushFile(path);
    },
    [documents, editorFlush, files, runCommand],
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
    !explanation.state &&
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
      if (isProjectImagePath(path)) {
        current.current.files.closeFile(path);
        return;
      }
      // The DOM editor holds only the active document, and its native flush is
      // fire-and-forget, so wait for the acknowledgement just for that document.
      // Skip the native flush when the editor hasn't reported ready — there are
      // no native-side edits to deliver, and the injection would time out.
      const activeKey = documents.activeKey;
      const nativeEdits =
        Boolean(activeKey && interaction?.key === activeKey) &&
        typeof interaction?.revision === "number" &&
        interaction.revision !== initialRevisions.current.get(activeKey!);
      if (
        path === files.activeFilePath &&
        isReady &&
        (documents.status.status !== "saved" || nativeEdits)
      )
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

  const projectSelectionMenu = (
    <ProjectCodeSelectionMenu
      onCommand={runCommand}
      canExplain={
        showSelectionMenu &&
        !conversation?.visible &&
        !interaction?.inlineSuggestionId
      }
      onExplain={() => {
        setSearchOpen(false);
        void explanation.start();
      }}
      commands={interaction?.commands}
    />
  );

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
      onInsertFromDraft={openInsertFromDraft}
      onTerminal={() => setTerminalOpen(true)}
      onUndo={() => runCommand("undo")}
      onRedo={() => runCommand("redo")}
      canUndo={Boolean(canShowEditorControls && interaction?.commands?.canUndo)}
      canRedo={Boolean(canShowEditorControls && interaction?.commands?.canRedo)}
      analysis={
        documents.activeKey &&
        textPath &&
        getCodeFileType(textPath) !== "unsupported"
          ? activeAnalysis
          : undefined
      }
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
      {/* Mounted only while open so the drafts table stays out of the editor's graph. */}
      {insertOpen ? (
        <Suspense fallback={null}>
          <DraftInsertSheet
            open={insertOpen}
            onOpenChange={setInsertOpen}
            projectSelection={insertTarget}
            onApply={applyDraftInsert}
          />
        </Suspense>
      ) : null}
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
            activeImagePath
              ? { status: "saved" }
              : documents.activeKey
                ? documents.status
                : query.isError && !query.isFetching
                  ? { status: "error", message: query.error.message }
                  : { status: "loading" }
          }
          onRetry={
            documents.activeKey ? documents.retry : () => void query.refetch()
          }
          readError={!activeImagePath && !documents.activeKey && query.isError}
        />
      ) : null}
      <View className="flex-1">
        {/* Warm the WebView before the first file read, then reuse it for every
            document. The empty editor stays hidden, read-only, and unfocused. */}
        <View
          className="absolute inset-0"
          style={{ opacity: isReady && !activeImagePath ? 1 : 0 }}
          pointerEvents={isReady && !activeImagePath ? "auto" : "none"}
          accessibilityElementsHidden={!isReady || Boolean(activeImagePath)}
          importantForAccessibility={
            isReady && !activeImagePath ? "auto" : "no-hide-descendants"
          }
        >
          <CodeEditor
            explanationRange={explanation.highlight}
            onContext={async (id, snapshot) => {
              if (id.startsWith("explain:")) {
                await explanation.onContext(id, snapshot);
                return;
              }
              if (id.startsWith("insert:")) {
                if (snapshot && insertRequest.current === id)
                  setInsertTarget({ from: snapshot.from, to: snapshot.to });
                insertRequest.current = null;
                return;
              }
              await voiceEditor.onContext(id, snapshot);
            }}
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
            bottomInset={bottomInset + (terminalOpen ? terminalHeight : 0)}
            keyboardAccessoryHeight={
              explanation.state && keyboardFrame
                ? badgeHeight + 8
                : showKeyboardAccessory
                  ? voiceAccessoryHeight
                  : 0
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
        {activeImagePath ? (
          <ProjectImagePreviewContent
            key={`${activeImagePath}:${files.getFileVersion(activeImagePath)}`}
            projectId={projectId}
            filePath={activeImagePath}
            dockHeight={bottomInset}
          />
        ) : !files.activeFilePath ? (
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
      {textPath && (explanation.state || searchOpen || !keyboardFrame) ? (
        <EditorBottomBar
          commandScope={`/projects/${projectId}/code`}
          frame={explanation.state || searchOpen ? keyboardFrame : undefined}
          dockHeight={dockHeight}
          onHeight={setBadgeHeight}
        >
          {explanation.state ? (
            <Animated.View
              key="explanation"
              entering={enterGlassSurface}
              exiting={exitGlassSurface}
              layout={LinearTransition.duration(220).reduceMotion(
                ReduceMotion.System,
              )}
            >
              <EditorExplanationBubble
                state={explanation.state}
                speaking={explanation.speaking}
                speechError={explanation.speechError}
                onToggleReadAloud={explanation.toggleReadAloud}
                maxHeight={Math.min(
                  360,
                  (keyboardFrame?.screenY ?? screenHeight) * 0.5,
                )}
                onClose={() => {
                  explanation.close();
                  if (keyboardFrame && documents.activeKey)
                    editor.current?.focus(documents.activeKey);
                }}
              />
            </Animated.View>
          ) : searchOpen ? (
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
            <Animated.View
              key="toolbar"
              layout={LinearTransition.duration(220).reduceMotion(
                ReduceMotion.System,
              )}
            >
              {toolbar}
            </Animated.View>
          )}
        </EditorBottomBar>
      ) : null}
      {showKeyboardAccessory ? (
        <ProjectCodeKeyboardAccessory
          status={toolbar}
          commandScope={`/projects/${projectId}/code`}
          onHeight={setVoiceAccessoryHeight}
          voice={
            conversation ? (
              <VoiceMicrophone conversation={conversation} compact launcher />
            ) : null
          }
          frame={keyboardFrame}
          onCommand={runCommand}
          canComment={interaction?.commands?.canComment}
          fold={interaction?.commands?.fold}
          onDismissKeyboard={() => editor.current?.dismissKeyboard()}
        >
          {showSelectionMenu ? projectSelectionMenu : null}
        </ProjectCodeKeyboardAccessory>
      ) : showSelectionMenu && !keyboardFrame && !explanation.state ? (
        <View className="absolute right-4 top-16">
          <GlassSurface borderRadius={24}>{projectSelectionMenu}</GlassSurface>
        </View>
      ) : null}
      {terminalOpen ? (
        <Suspense fallback={null}>
          <TerminalPanel
            projectId={projectId}
            activeFilePath={textPath}
            dockHeight={dockHeight}
            height={terminalHeight}
            onHeightChange={setTerminalHeight}
            onClose={() => setTerminalOpen(false)}
            onSyncFiles={refreshAfterTerminalSync}
          />
        </Suspense>
      ) : null}
    </View>
  );
};

export default CodeScreen;
