import {
  ActivityIndicator,
  Pressable,
  View,
  type ViewProps,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass-surface";
import { PText } from "@/components/ui/text";
import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import { diagnosticSeverities } from "@/features/projects/actions/code-intelligence-schemas";
import {
  formatCodeAnalysisLabel,
  formatCodeDiagnostic,
  formatCodeDiagnosticCount,
  formatProjectFileSaveStatus,
} from "@/features/projects/lib/formatters";
import type { SaveSnapshot } from "../lib/project-file-save-document";

export const ProjectCodeStatus = ({
  status: save,
  analysis,
  onRetry,
  onProblems,
  readError = false,
  onLayout,
}: {
  onProblems?: () => void;
  onLayout?: ViewProps["onLayout"];
  readError?: boolean;
  status: SaveSnapshot;
  analysis?: CodeEditorAnalysis;
  onRetry: () => void;
}) => {
  const status = save.status;
  const presentation = formatProjectFileSaveStatus(status);
  const canRetry = status === "error";
  const IndicatorContainer = canRetry ? Pressable : View;
  return (
    <GlassSurface borderRadius={24}>
      <View
        onLayout={onLayout}
        className="min-h-12 flex-row items-center gap-2 px-3"
      >
        {analysis && analysis.status !== "unsupported" ? (
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
        ) : null}
        <View>
          <IndicatorContainer
            accessible
            accessibilityRole={canRetry ? "button" : "image"}
            accessibilityLabel={
              readError
                ? "Couldn't load file. Tap to retry."
                : presentation.label
            }
            accessibilityHint={canRetry ? save.message : undefined}
            accessibilityState={{ busy: presentation.busy }}
            accessibilityLiveRegion="polite"
            onPress={canRetry ? onRetry : undefined}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            {presentation.busy ? (
              <ActivityIndicator size="small" className="text-foreground" />
            ) : (
              <Icon
                {...presentation.icon}
                size={22}
                className="text-foreground"
              />
            )}
          </IndicatorContainer>
        </View>
      </View>
    </GlassSurface>
  );
};
