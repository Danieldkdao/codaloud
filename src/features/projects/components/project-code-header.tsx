import { Pressable, View } from "react-native";
import { ProjectIcon } from "@/components/project-icon";
import { Icon } from "@/components/ui/icon";
import { CodeText, PText } from "@/components/ui/text";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import { diagnosticSeverities } from "@/features/projects/actions/code-intelligence-schemas";
import { formatCodeAnalysisLabel, formatCodeDiagnostic, formatCodeDiagnosticCount } from "@/features/projects/lib/formatters";

export const ProjectCodeHeader = ({ filePath, analysis, onShowProblems }: {
  filePath: string;
  analysis?: CodeEditorAnalysis;
  onShowProblems?: () => void;
}) => (
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
  </View>
);
