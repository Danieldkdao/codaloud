import { randomUUID } from "expo-crypto";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import CodeEditor, {
  type CodeEditorInteraction,
  type CodeEditorRef,
} from "@/components/code-editor";
import { CodeEditorLoading } from "@/components/code-editor-loading";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import { DraftEditorDock } from "@/features/drafts/components/draft-editor-dock";
import { DraftEditorHeader } from "@/features/drafts/components/draft-editor-header";
import { DraftAssetPreviewContent } from "@/features/drafts/components/draft-asset-preview-content";
import { EditorProblemsSheet } from "@/features/editor/components/editor-problems-sheet";
import { EditorBottomBar } from "@/features/editor/components/editor-bottom-bar";
import { EditorSearchBar } from "@/features/editor/components/editor-search-bar";
import { useDeleteDraft } from "@/features/drafts/hooks/use-delete-draft";
import {
  useDraftSave,
  type DraftSaveInput,
} from "@/features/drafts/hooks/use-draft-save";
import { useDraft } from "@/features/drafts/hooks/use-draft";
import {
  disposeDraftIntelligence,
  readDraftCodeIntelligence,
} from "@/features/drafts/lib/draft-intelligence";
import { resolveDraftLanguage } from "@/features/drafts/lib/draft-filename";
import { draftHasAsset } from "@/features/drafts/lib/draft-assets";
import { isProjectImagePath } from "@/features/projects/lib/image-files";
import { formatDraftTitle } from "@/features/drafts/lib/formatters";
import { NEW_DRAFT_PARAM } from "@/features/drafts/constants";
import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import { useTheme } from "@/hooks/use-theme";
import { alert, confirmAction, isValidIds } from "@/lib/utils";
import { useVoiceEditor } from "@/features/voice/hooks/use-voice-editor";
import { useVoiceConversation } from "@/features/voice/hooks/use-voice-conversation";
import { InlineVoiceControls } from "@/features/voice/components/inline-voice-controls";
import { VoiceMicrophone } from "@/features/voice/components/voice-microphone";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { ProjectCodeKeyboardAccessory } from "@/features/projects/components/project-code-keyboard-accessory";
import { ProjectCodeToolbar } from "@/features/projects/components/project-code-toolbar";
import type {
  EditorCommand,
  EditorSearchQuery,
  EditorSearchSummary,
} from "@/features/editor/types";

const runDraftOperation = async <T,>(
  _label: string,
  action: (assertCurrent: () => void) => Promise<T>,
) => action(() => {});

const DraftEditorScreen = () => {
  const { draftId: draftIdParam = NEW_DRAFT_PARAM } = useLocalSearchParams<{
    draftId: string;
  }>();
  const router = useRouter();
  const storedId = isValidIds(draftIdParam) ? draftIdParam : null;
  const query = useDraft(storedId);
  const deletion = useDeleteDraft();
  const { state, message, schedule, saveNow, hasUnsavedChanges } =
    useDraftSave(storedId);
  const { preferences } = useEditorPreferences();
  const { isDarkMode } = useTheme();
  const editor = useRef<CodeEditorRef>(null);
  const [buffer, setBuffer] = useState<DraftSaveInput>({
    filename: null,
    content: "",
  });
  // Frozen at mount so typing cannot rebuild the document under the editor.
  const [seed, setSeed] = useState<{ key: string; content: string } | null>(
    null,
  );
  const [analysis, setAnalysis] = useState<CodeEditorAnalysis | undefined>();
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [dockHeight, setDockHeight] = useState(64);
  const [barHeight, setBarHeight] = useState(48);
  const [readyKey, setReadyKey] = useState<string | undefined>();
  const [editorFocused, setEditorFocused] = useState(false);
  const [interaction, setInteraction] = useState<CodeEditorInteraction>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<EditorSearchQuery>({
    search: "",
  });
  const [searchSummary, setSearchSummary] = useState<EditorSearchSummary>();
  const [accessoryHeight, setAccessoryHeight] = useState(160);
  const keyboardFrame = useKeyboardFrame();
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;

  const loaded = storedId === null || Boolean(query.data);

  useEffect(() => {
    if (!loaded || seed) return;
    const content = query.data?.content ?? "";
    setSeed({ key: `draft:${randomUUID()}`, content });
    const initial = { filename: query.data?.filename ?? null, content };
    bufferRef.current = initial;
    setBuffer(initial);
  }, [loaded, query.data, seed]);

  useEffect(() => () => disposeDraftIntelligence(), []);

  const language = resolveDraftLanguage(buffer.filename);
  const hasAsset = storedId ? draftHasAsset(storedId) : false;
  const isReady = Boolean(seed) && (hasAsset || readyKey === seed?.key);
  const voiceScope = `draft:${storedId ?? seed?.key ?? "loading"}`;
  const voiceEnabled = isReady && !hasAsset && !deletion.isPending;
  const voiceEditor = useVoiceEditor({
    projectId: voiceScope,
    draft: true,
    branch: null,
    busy: !voiceEnabled,
    activePath: hasAsset ? null : (buffer.filename ?? "untitled.txt"),
    documentKey: seed?.key,
    editor,
    getOpenFiles: () => [],
    runWorkspaceOperation: runDraftOperation,
  });
  const conversation = useVoiceConversation(
    voiceEnabled,
    voiceScope,
    voiceScope,
    true,
  );

  const handleChange = useCallback(
    async (content: string) => {
      const next = { filename: bufferRef.current.filename, content };
      bufferRef.current = next;
      setBuffer(next);
      schedule(next);
    },
    [schedule],
  );

  const handleFilename = useCallback(
    (value: string) => {
      const next = {
        filename: value.trim() === "" ? null : value,
        content: bufferRef.current.content,
      };
      bufferRef.current = next;
      setBuffer(next);
      // A name alone saves a draft even while its contents are still empty.
      schedule(next);
    },
    [schedule],
  );

  const copyToProject = async () => {
    const draftId = await saveNow(bufferRef.current);
    if (!draftId) {
      alert(message ?? "Add content or a filename to save this draft first.");
      return;
    }
    router.push({ pathname: "/draft/copy-to-project", params: { draftId } });
  };

  const done = async () => {
    const saved = await saveNow(bufferRef.current);
    if (
      !saved &&
      (storedId || bufferRef.current.filename || bufferRef.current.content)
    ) {
      alert(
        message ?? "Give this draft a filename or some content before closing.",
      );
      return;
    }
    router.back();
  };

  const deleteDraft = () => {
    if (!storedId) return;
    confirmAction(
      "Delete draft?",
      `Are you sure you want to delete "${formatDraftTitle({ filename: buffer.filename })}"? This action cannot be undone.`,
      {
        actionText: "Delete",
        onConfirmPress: async () => {
          try {
            await deletion.mutateAsync(storedId);
            router.back();
          } catch (error) {
            alert(
              error instanceof Error
                ? error.message
                : "Unable to delete this draft. Please try again.",
            );
          }
        },
      },
    );
  };

  const runCommand = (command: EditorCommand, text?: string) => {
    if (seed) editor.current?.command(command, text ?? "", seed.key);
  };
  const toolbar = (
    <ProjectCodeToolbar
      draft
      disabled={!isReady || deletion.isPending}
      analysis={language.diagnostics ? analysis : undefined}
      onProblems={() => setProblemsOpen(true)}
      onFormat={() => seed && editor.current?.transform("format", seed.key)}
      onOrganize={() =>
        seed && editor.current?.transform("organize-imports", seed.key)
      }
      onFind={() => {
        setReplaceOpen(false);
        setSearchOpen(true);
      }}
      onUndo={() => runCommand("undo")}
      onRedo={() => runCommand("redo")}
      canUndo={Boolean(interaction?.commands?.canUndo)}
      canRedo={Boolean(interaction?.commands?.canRedo)}
    />
  );

  if (storedId && query.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <HeadingText className="text-center text-2xl font-semibold">
          Couldn't open this draft
        </HeadingText>
        <PText accessibilityRole="alert" className="max-w-100 text-center">
          {query.error.message}
        </PText>
        <View className="flex-row gap-3">
          <Button variant="outline" onPress={() => router.back()}>
            Go back
          </Button>
          <Button
            disabled={query.isFetching}
            onPress={() => void query.refetch()}
          >
            {query.isFetching ? "Retrying…" : "Try again"}
          </Button>
        </View>
      </View>
    );
  }

  if (!seed) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading draft"
        accessibilityState={{ busy: true }}
      >
        <ActivityIndicator
          size="large"
          className="text-primary"
          accessible={false}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: buffer.filename ? formatDraftTitle(buffer) : "New draft",
          headerRight: () => (
            <Button
              variant="ghost"
              disabled={deletion.isPending}
              accessibilityLabel="Save and close this draft"
              onPress={() => void done()}
            >
              Done
            </Button>
          ),
        }}
      />
      <EditorProblemsSheet
        open={problemsOpen}
        onOpenChange={setProblemsOpen}
        analysis={analysis}
        onSelect={(diagnostic) => {
          setProblemsOpen(false);
          if (analysis?.revision !== undefined)
            editor.current?.revealDiagnostic(
              diagnostic.from,
              diagnostic.to,
              analysis.revision,
              seed.key,
            );
        }}
      />
      <DraftEditorHeader
        filename={buffer.filename ?? ""}
        language={language}
        saveState={state}
        saveMessage={message}
        assetLabel={
          hasAsset
            ? isProjectImagePath(buffer.filename ?? "")
              ? "Image"
              : "File"
            : undefined
        }
        disabled={deletion.isPending}
        onFilenameChange={handleFilename}
      />
      <View
        className="flex-1"
        style={{ opacity: isReady ? 1 : 0 }}
        pointerEvents={isReady ? "auto" : "none"}
        accessibilityElementsHidden={!isReady}
        importantForAccessibility={isReady ? "auto" : "no-hide-descendants"}
      >
        {hasAsset && storedId ? (
          <DraftAssetPreviewContent
            draftId={storedId}
            filename={buffer.filename ?? "File"}
          />
        ) : (
          <CodeEditor
            ref={editor}
            onContext={voiceEditor.onContext}
            onInteractionChange={async (state, key) => {
              setEditorFocused(state.focused);
              if (key === seed.key) setInteraction(state);
              voiceEditor.onInteraction(state, key);
            }}
            searchQuery={searchOpen ? searchQuery : undefined}
            onSearchSummary={async (summary, key) => {
              if (key === seed.key) setSearchSummary(summary);
            }}
            onSuggestionAction={voiceEditor.onSuggestionAction}
            onSuggestionApplied={voiceEditor.onSuggestionApplied}
            documentKey={seed.key}
            filename={language.editorFilename}
            initialValue={seed.content}
            preferences={preferences}
            colorScheme={isDarkMode ? "dark" : "light"}
            bottomInset={dockHeight + barHeight + 20}
            keyboardAccessoryHeight={
              editorFocused && keyboardFrame && !searchOpen
                ? accessoryHeight
                : 0
            }
            onRequestAnalysis={
              language.intelligence ? readDraftCodeIntelligence : undefined
            }
            onAnalysis={async (next) => setAnalysis(next)}
            onChange={handleChange}
            onReady={async (key) => setReadyKey(key)}
            dom={{
              onLoadStart: () => setReadyKey(undefined),
              style: { flex: 1 },
              containerStyle: { flex: 1 },
              scrollEnabled: true,
              bounces: false,
              contentInsetAdjustmentBehavior: "never",
              automaticallyAdjustContentInsets: false,
              hideKeyboardAccessoryView: true,
            }}
          />
        )}
      </View>
      {isReady && !hasAsset && (searchOpen || !keyboardFrame) ? (
        <EditorBottomBar
          frame={searchOpen ? keyboardFrame : undefined}
          dockHeight={dockHeight}
          onHeight={setBarHeight}
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
                editor.current?.focus(seed.key);
              }}
              onCommand={(command) =>
                editor.current?.searchCommand(command, searchQuery, seed.key)
              }
            />
          ) : (
            toolbar
          )}
        </EditorBottomBar>
      ) : null}
      {isReady && !hasAsset && editorFocused && keyboardFrame && !searchOpen ? (
        <ProjectCodeKeyboardAccessory
          status={toolbar}
          voiceActive={Boolean(conversation?.visible)}
          voiceFeedbackAboveRows
          voice={
            voiceEnabled && conversation && !conversation.visible ? (
              <VoiceMicrophone conversation={conversation} compact />
            ) : null
          }
          feedback={
            conversation?.visible ? (
              <InlineVoiceControls conversation={conversation} />
            ) : null
          }
          frame={keyboardFrame}
          onHeight={setAccessoryHeight}
          onCommand={runCommand}
          canComment={interaction?.commands?.canComment}
          fold={interaction?.commands?.fold}
          onDismissKeyboard={() => editor.current?.dismissKeyboard()}
        />
      ) : null}
      {!isReady ? <CodeEditorLoading bottomInset={dockHeight} /> : null}
      <View
        onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
      >
        <DraftEditorDock
          analysis={language.diagnostics ? analysis : undefined}
          disabled={deletion.isPending}
          onProblems={analysis ? () => setProblemsOpen(true) : undefined}
          onCopyToProject={() => void copyToProject()}
          conversation={voiceEnabled ? conversation : undefined}
          showVoiceFeedback={!(editorFocused && keyboardFrame && !searchOpen)}
        />
        {storedId ? (
          <View className="items-center pb-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={deletion.isPending || hasUnsavedChanges()}
              accessibilityLabel="Delete this draft"
              onPress={deleteDraft}
            >
              Delete draft
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default DraftEditorScreen;
