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
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import {
  diagnosticSeverities,
  type DiagnosticSeverity,
} from "@/features/projects/actions/code-intelligence-schemas";
import { formatCodeDiagnostic } from "@/features/projects/lib/formatters";
import { filterEditorProblems } from "../problems";
import {
  formatProblemAccent,
  formatProblemFilter,
  formatProblemLocation,
} from "../lib/formatters";

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
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<DiagnosticSeverity | "all">("all");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 150);
    return () => clearTimeout(timer);
  }, [search]);
  const problems = filterEditorProblems(
    analysis?.diagnostics ?? [],
    query,
    severity,
  );
  return (
    <ContentSheet
      open={open}
      onOpenChange={onOpenChange}
      backgroundColor={background}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ height: height * 0.7 }}
        className="gap-3 px-4 pb-4"
        accessibilityViewIsModal
        onAccessibilityEscape={() => onOpenChange(false)}
      >
        <View className="flex-row items-center justify-between">
          <PText
            accessibilityRole="header"
            className="text-xl font-semibold text-foreground"
          >
            Problems in this file
          </PText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close problems"
            onPress={() => onOpenChange(false)}
            className="min-h-11 justify-center px-2"
          >
            <PText className="text-primary">Done</PText>
          </Pressable>
        </View>
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
        <View className="flex-row flex-wrap gap-1">
          {(["all", ...diagnosticSeverities] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: severity === value }}
              onPress={() => setSeverity(value)}
              className={cn(
                "min-h-11 min-w-11 items-center justify-center rounded-xl px-3",
                severity === value && "bg-secondary",
              )}
            >
              <PText>{formatProblemFilter(value)}</PText>
            </Pressable>
          ))}
        </View>
        <Input
          accessibilityLabel="Search problems"
          placeholder="Search messages or diagnostic codes"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </KeyboardAvoidingView>
    </ContentSheet>
  );
};
