import {
  ActivityIndicator,
  Pressable,
  View,
  type ViewProps,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
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
  onShowProblems,
  onRetry,
  readError = false,
  onLayout,
}: {
  onLayout?: ViewProps["onLayout"];
  readError?: boolean;
  status: SaveSnapshot;
  analysis?: CodeEditorAnalysis;
  onShowProblems: () => void;
  onRetry: () => void;
}) => {
  const status = save.status;
  const presentation = formatProjectFileSaveStatus(status);
  const canRetry = status === "error";
  const IndicatorContainer = canRetry ? Pressable : View;
  return (
    <View
      onLayout={onLayout}
      className="min-h-12 flex-row items-center gap-2 overflow-hidden rounded-full border border-border bg-secondary px-3"
    >
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
              <Icon
                family="Feather"
                name="alert-circle"
                size={18}
                className="text-muted-foreground"
              />
              <PText className="text-base text-muted-foreground">
                Unavailable
              </PText>
            </View>
          ) : (
            diagnosticSeverities.map((severity) => {
              const count = analysis.diagnostics.filter(
                (item) => item.severity === severity,
              ).length;
              const presentation = formatCodeDiagnostic(severity);
              const className = count
                ? presentation.className
                : "text-muted-foreground";
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
                    className={className}
                  />
                  {analysis.status === "checking" ? (
                    <Icon
                      family="Octicons"
                      name="dot-fill"
                      size={8}
                      className="text-muted-foreground/50"
                      accessible={false}
                    />
                  ) : (
                    <PText className={cn("text-base", className)}>
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
            readError ? "Couldn't load file. Tap to retry." : presentation.label
          }
          accessibilityHint={canRetry ? save.message : undefined}
          accessibilityState={{ busy: presentation.busy }}
          accessibilityLiveRegion="polite"
          onPress={canRetry ? onRetry : undefined}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          {presentation.busy ? (
            <ActivityIndicator size="small" className="text-muted-foreground" />
          ) : (
            <Icon
              {...presentation.icon}
              size={22}
              className={presentation.className}
            />
          )}
        </IndicatorContainer>
      </View>
    </View>
  );
};
