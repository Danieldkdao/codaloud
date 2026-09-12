import { ActivityIndicator, Pressable, View } from "react-native";
import { ProjectIcon } from "@/components/project-icon";
import { Icon } from "@/components/ui/icon";
import { CodeText, PText } from "@/components/ui/text";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import { diagnosticSeverities } from "@/features/projects/actions/code-intelligence-schemas";
import { formatCodeAnalysisLabel, formatCodeDiagnostic, formatCodeDiagnosticCount, formatProjectFileSaveStatus } from "@/features/projects/lib/formatters";
import { useProjectFileSave, type ProjectFileSaveStatus } from "@/features/projects/hooks/use-project-file-save";

export const ProjectCodeHeader = ({ filePath, fileStatus, analysis, onShowProblems }: {
  filePath: string;
  fileStatus?: Extract<ProjectFileSaveStatus, "loading" | "error">;
  analysis?: CodeEditorAnalysis;
  onShowProblems?: () => void;
}) => {
  const save = useProjectFileSave();
  const status = fileStatus ?? save?.status ?? "loading";
  const presentation = formatProjectFileSaveStatus(status);
  const canRetry = !fileStatus && status === "error" && Boolean(save);
  const IndicatorContainer = canRetry ? Pressable : View;
  return (
    <View className="min-h-14 flex-row items-center gap-2.5 border-b border-border px-4">
      <ProjectIcon name={filePath} isDirectory={false} />
      <CodeText className="min-w-0 flex-1 text-foreground" numberOfLines={1} ellipsizeMode="middle">{filePath}</CodeText>
      {analysis && analysis.status !== "unsupported" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={formatCodeAnalysisLabel(analysis)}
          accessibilityHint="Opens the list of problems in this file."
          onPress={onShowProblems}
          className="min-h-11 flex-row items-center gap-3"
        >
          {analysis.status === "unavailable" ? (
            <View className="flex-row items-center gap-1.5">
              <Icon family="Feather" name="alert-circle" size={18} className="text-muted-foreground" />
              <PText className="text-base text-muted-foreground">Unavailable</PText>
            </View>
          ) : diagnosticSeverities.map((severity) => {
            const count = analysis.diagnostics.filter((item) => item.severity === severity).length;
            const presentation = formatCodeDiagnostic(severity);
            const className = count ? presentation.className : "text-muted-foreground";
            return (
              <View key={severity} className="flex-row items-center gap-1" accessible={false}>
                <Icon family="Feather" name={presentation.icon} size={16} className={className} />
                <PText className={`text-base ${className}`}>{analysis.status === "checking" ? "·" : formatCodeDiagnosticCount(count)}</PText>
              </View>
            );
          })}
        </Pressable>
      ) : null}
      <IndicatorContainer
        accessible
        accessibilityRole={canRetry ? "button" : "image"}
        accessibilityLabel={fileStatus === "error" ? "Couldn't load file" : presentation.label}
        accessibilityHint={canRetry ? save?.message : undefined}
        accessibilityState={{ busy: presentation.busy }}
        accessibilityLiveRegion="polite"
        onPress={canRetry ? save?.retry : undefined}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        {presentation.busy ? <ActivityIndicator size="small" className="text-muted-foreground" /> : (
          <Icon family="MaterialCommunityIcons" name={presentation.icon} size={22} className={presentation.className} />
        )}
      </IndicatorContainer>
    </View>
  );
};
