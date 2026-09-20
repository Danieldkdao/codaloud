import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import CodeEditor, { type CodeEditorRef } from "@/components/code-editor";
import type { CodeEditorMatchState } from "@/components/code-editor-matches";
import { CodeEditorLoading } from "@/components/code-editor-loading";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { formatProjectFilePreviewMatches } from "@/features/projects/lib/formatters";
import { useTheme, useThemeColor } from "@/hooks/use-theme";

type ProjectFilePreviewContentProps = {
  filePath: string;
  content: string;
  search: string | null;
  dockHeight: number;
  onOpen: () => void;
};

export const ProjectFilePreviewContent = ({
  filePath,
  content,
  search,
  dockHeight,
  onOpen,
}: ProjectFilePreviewContentProps) => {
  const { preferences } = useEditorPreferences();
  const { isDarkMode } = useTheme();
  const shadow = useThemeColor("navigation-shadow");
  const editor = useRef<CodeEditorRef>(null);
  const mounted = useRef(true);
  const currentContent = useRef(content);
  currentContent.current = content;
  const [readyContent, setReadyContent] = useState<string | null>(null);
  const [reportedMatches, setReportedMatches] = useState<{
    content: string;
    summary: CodeEditorMatchState;
  } | null>(null);
  const [controlsHeight, setControlsHeight] = useState(56);
  const isReady = readyContent === content;
  const summary =
    reportedMatches?.content === content ? reportedMatches.summary : null;
  const canNavigate = isReady && summary !== null && summary.total > 0;
  // Measure the whole floating group, including wrapping at larger text sizes.
  const bottomInset = dockHeight + controlsHeight + 24;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleReady = useCallback(async () => {
    if (mounted.current && currentContent.current === content)
      setReadyContent(content);
  }, [content]);
  const handleMatches = useCallback(
    async (next: CodeEditorMatchState) => {
      if (mounted.current && currentContent.current === content)
        setReportedMatches({ content, summary: next });
    },
    [content],
  );
  const counter = formatProjectFilePreviewMatches(isReady ? summary : null);

  return (
    <View className="flex-1">
      <View
        className="flex-1"
        pointerEvents={isReady ? "auto" : "none"}
        accessibilityElementsHidden={!isReady}
        importantForAccessibility={isReady ? "auto" : "no-hide-descendants"}
      >
        <CodeEditor
          ref={editor}
          preferences={preferences}
          filename={filePath}
          initialValue={content}
          readOnly
          matches={search === null ? [] : [search]}
          onMatchesChange={handleMatches}
          colorScheme={isDarkMode ? "dark" : "light"}
          onReady={handleReady}
          bottomInset={bottomInset}
          dom={{
            onLoadStart: () => {
              setReadyContent(null);
              setReportedMatches(null);
            },
            style: { flex: 1 },
            containerStyle: { flex: 1 },
            scrollEnabled: true,
            bounces: false,
            contentInsetAdjustmentBehavior: "never",
            automaticallyAdjustContentInsets: false,
          }}
        />
      </View>
      {!isReady ? <CodeEditorLoading bottomInset={bottomInset} /> : null}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-4 items-center"
        style={{ bottom: dockHeight + 12 }}
      >
        <View
          className="max-w-full flex-row flex-wrap items-center justify-center gap-1 rounded-3xl bg-primary p-1"
          onLayout={(event) =>
            setControlsHeight(event.nativeEvent.layout.height)
          }
          style={{
            boxShadow: [
              { offsetX: 0, offsetY: 3, blurRadius: 12, color: shadow },
            ],
          }}
        >
          <Button
            size="lg"
            className="shrink rounded-full px-3"
            accessibilityLabel="Open in editor"
            accessibilityHint="Opens this file in the code editor"
            onPress={onOpen}
          >
            <Icon
              family="Feather"
              name="edit-3"
              size={20}
              accessible={false}
              className="text-primary-foreground"
            />
            Open in editor
          </Button>
          {search !== null ? (
            <View className="flex-row items-center">
              <Button
                size="icon"
                className="rounded-full"
                disabled={!canNavigate}
                accessibilityLabel="Previous match"
                onPress={() => editor.current?.previousMatch()}
              >
                <Icon
                  family="Feather"
                  name="chevron-up"
                  size={22}
                  accessible={false}
                  className="text-primary-foreground"
                />
              </Button>
              <PText
                className="text-base tabular-nums text-primary-foreground"
                accessibilityLabel={counter.accessibilityLabel}
                accessibilityLiveRegion="polite"
              >
                {counter.label}
              </PText>
              <Button
                size="icon"
                className="rounded-full"
                disabled={!canNavigate}
                accessibilityLabel="Next match"
                onPress={() => editor.current?.nextMatch()}
              >
                <Icon
                  family="Feather"
                  name="chevron-down"
                  size={22}
                  accessible={false}
                  className="text-primary-foreground"
                />
              </Button>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};
