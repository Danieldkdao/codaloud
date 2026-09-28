import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { ContentSheet } from "@/components/ui/content-sheet";
import { GlassSurface } from "@/components/ui/glass-surface";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Input } from "@/components/ui/input";
import { HeadingText, PText } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { cn } from "@/lib/utils";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import {
  diagnosticSeverities,
  type DiagnosticSeverity,
} from "@/features/projects/actions/code-intelligence-schemas";
import { formatCodeDiagnostic } from "@/features/projects/lib/formatters";
import { filterEditorProblems, isAnalysisSuppressed } from "../problems";
import {
  formatProblemAccent,
  formatProblemFilter,
  formatProblemLocation,
  formatSuppressedAnalysisNotice,
} from "../lib/formatters";

const problemFilters = ["all", ...diagnosticSeverities] as const;

export const EditorProblemsSheet = ({
  open,
  onOpenChange,
  analysis,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis?: CodeEditorAnalysis;
  onSelect: (
    diagnostic: NonNullable<CodeEditorAnalysis>["diagnostics"][number],
  ) => void;
}) => {
  const background = useThemeColor("background");
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardFrame();
  const insets = useSafeAreaInsets();
  const [filterWidth, setFilterWidth] = useState(0);
  // Keep the list and footer within the usable area when the keyboard opens.
  const availableHeight =
    Platform.OS === "ios" && keyboard
      ? Math.max(0, Math.min(height, keyboard.screenY))
      : height;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<DiagnosticSeverity | "all">("all");
  const segmentWidth = Math.max(0, (filterWidth - 8) / problemFilters.length);
  const selectedIndex = problemFilters.indexOf(severity);
  const selectionStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [
      {
        translateX: withSpring(selectedIndex * segmentWidth, {
          damping: 24,
          stiffness: 260,
          mass: 0.8,
          reduceMotion: ReduceMotion.System,
        }),
      },
    ],
  }));
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 150);
    return () => clearTimeout(timer);
  }, [search]);
  const problems = filterEditorProblems(
    analysis?.diagnostics ?? [],
    query,
    severity,
  );
  // Read the unfiltered list: the notice explains why the file looks clean of
  // other findings, which is true regardless of what is currently filtered.
  const suppressed =
    analysis?.status === "ready" && isAnalysisSuppressed(analysis.diagnostics);
  return (
    <ContentSheet
      scrollable={false}
      open={open}
      onOpenChange={onOpenChange}
      backgroundColor={background}
    >
      <KeyboardAvoidingView
        // UIKit moves the iOS sheet above the keyboard; extra RN padding would
        // subtract its height a second time and hide the search controls.
        behavior={Platform.OS === "android" ? "height" : undefined}
        style={{
          height: availableHeight * 0.7,
          flexShrink: 1,
          paddingBottom: keyboard ? 0 : insets.bottom,
        }}
        className="gap-3 px-4"
        accessibilityViewIsModal
        onAccessibilityEscape={() => onOpenChange(false)}
      >
        <View className="min-h-14 shrink-0 flex-row items-center justify-between gap-3">
          <HeadingText
            accessibilityRole="header"
            className="min-w-0 flex-1 text-xl font-semibold text-foreground"
          >
            Problems in this file
          </HeadingText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close problems"
            onPress={() => onOpenChange(false)}
            className="min-h-11 justify-center px-2"
          >
            <PText className="text-primary">Done</PText>
          </Pressable>
        </View>
        {suppressed && (
          <View className="shrink-0 gap-1 rounded-2xl bg-info/10 p-3">
            <PText className="text-base text-info">
              {formatSuppressedAnalysisNotice(analysis.diagnostics.length)}
            </PText>
          </View>
        )}
        <FlatList
          style={{ flex: 1 }}
          data={problems}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item, index) => `${item.from}:${item.code}:${index}`}
          ListEmptyComponent={
            <PText className="py-6 text-center">
              {analysis?.status === "unavailable"
                ? "Analysis unavailable. Edit or reopen this file to retry."
                : analysis?.status === "checking"
                  ? "Checking this file…"
                  : "No matching problems."}
            </PText>
          }
          renderItem={({ item }) => {
            const presentation = formatCodeDiagnostic(item.severity);
            const accent = formatProblemAccent(item.severity);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.severity}: ${item.message}, ${formatProblemLocation(item)}`}
                onPress={() => onSelect(item)}
                className={cn(
                  "min-h-14 flex-row gap-3 rounded-2xl p-3 mb-2 active:opacity-70",
                  accent.background,
                )}
              >
                <Icon
                  family="Feather"
                  name={presentation.icon}
                  size={22}
                  className={accent.text}
                />
                <View className="min-w-0 flex-1 gap-1">
                  <PText className={cn("text-base", accent.text)}>
                    {item.message}
                  </PText>
                  <PText>{formatProblemLocation(item)}</PText>
                </View>
              </Pressable>
            );
          }}
        />
        <GlassSurface borderRadius={28}>
          <View
            accessibilityRole="tablist"
            accessibilityLabel="Diagnostic severity"
            onLayout={(event) => setFilterWidth(event.nativeEvent.layout.width)}
            className="relative flex-row p-1"
          >
            {filterWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                className="absolute bottom-1 left-1 top-1 rounded-full bg-secondary/70"
                style={selectionStyle}
              />
            )}
            {problemFilters.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: severity === value }}
                onPress={() => setSeverity(value)}
                className="min-h-11 min-w-0 flex-1 items-center justify-center rounded-full px-1 py-2"
              >
                <PText
                  className={cn(
                    "text-center",
                    severity === value && "font-semibold",
                  )}
                >
                  {formatProblemFilter(value)}
                </PText>
              </Pressable>
            ))}
          </View>
        </GlassSurface>
        <GlassSurface borderRadius={28}>
          <View className="flex-row items-center pl-4 pr-2">
            <Icon
              family="Feather"
              name="search"
              size={20}
              className="text-muted-foreground"
              accessible={false}
            />
            <Input
              type="search"
              variant="ghost"
              containerClassName="min-w-0 flex-1"
              accessibilityLabel="Search problems"
              placeholder="Search messages or diagnostic codes"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        </GlassSurface>
      </KeyboardAvoidingView>
    </ContentSheet>
  );
};
