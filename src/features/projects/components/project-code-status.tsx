import { Pressable, View, type ViewProps } from "react-native";
import { Icon } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass-surface";
import { PText } from "@/components/ui/text";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import { diagnosticSeverities } from "@/features/projects/actions/code-intelligence-schemas";
import {
  formatCodeAnalysisLabel,
  formatCodeDiagnostic,
  formatCodeDiagnosticCount,
} from "@/features/projects/lib/formatters";

export const ProjectCodeStatus = ({
  analysis,
  onProblems,
  onLayout,
}: {
  onProblems?: () => void;
  onLayout?: ViewProps["onLayout"];
  analysis?: CodeEditorAnalysis;
}) => {
  if (!analysis || analysis.status === "unsupported") return null;
  return (
    <GlassSurface borderRadius={24}>
      <View
        onLayout={onLayout}
        className="min-h-12 flex-row items-center gap-2 px-3"
      >
        <Pressable
          onPress={onProblems}
          accessible
          accessibilityRole="button"
          accessibilityLabel={formatCodeAnalysisLabel(analysis)}
          className="min-h-11 flex-row items-center gap-3"
        >
          {analysis.status === "unavailable" ? (
            <View className="flex-row items-center gap-1.5">
              <Icon
                family="Feather"
                name="alert-circle"
                size={18}
                className="text-foreground"
              />
              <PText className="text-base text-foreground">Unavailable</PText>
            </View>
          ) : (
            diagnosticSeverities.map((severity) => {
              const count = analysis.diagnostics.filter(
                (item) => item.severity === severity,
              ).length;
              const presentation = formatCodeDiagnostic(severity);
              return (
                <View
                  key={severity}
                  className="flex-row items-center gap-1"
                  accessible={false}
                >
                  <Icon
                    family="Feather"
                    name={presentation.icon}
                    size={16}
                    className="text-foreground"
                  />
                  {analysis.status === "checking" ? (
                    <Icon
                      family="Octicons"
                      name="dot-fill"
                      size={8}
                      className="text-foreground"
                      accessible={false}
                    />
                  ) : (
                    <PText className="text-base text-foreground">
                      {formatCodeDiagnosticCount(count)}
                    </PText>
                  )}
                </View>
              );
            })
          )}
        </Pressable>
      </View>
    </GlassSurface>
  );
};
