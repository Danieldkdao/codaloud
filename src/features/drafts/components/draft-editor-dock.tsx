import { Pressable, View } from "react-native";

import type { CodeEditorAnalysis } from "@/components/code-editor-intelligence";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { diagnosticSeverities } from "@/features/projects/actions/code-intelligence-schemas";
import {
  formatCodeAnalysisLabel,
  formatCodeDiagnostic,
  formatCodeDiagnosticCount,
} from "@/features/projects/lib/formatters";
import { InlineVoiceControls } from "@/features/voice/components/inline-voice-controls";
import { VoiceMicrophone } from "@/features/voice/components/voice-microphone";
import type { VoiceConversation } from "@/features/voice/hooks/use-voice-conversation";
import { cn } from "@/lib/utils";
import { ProjectCodeTools } from "@/features/projects/components/project-code-tools";

export type DraftEditorDockProps = {
  analysis?: CodeEditorAnalysis;
  disabled?: boolean;
  onProblems?: () => void;
  onCopyToProject: () => void;
  conversation?: VoiceConversation;
  showVoiceFeedback?: boolean;
};

export const DraftEditorDock = ({
  analysis,
  disabled = false,
  onProblems,
  onCopyToProject,
  conversation,
  showVoiceFeedback = true,
}: DraftEditorDockProps) => (
  <View
    pointerEvents={disabled ? "none" : "auto"}
    accessibilityState={{ disabled }}
    className={cn("w-full gap-2 px-4 py-3", disabled && "opacity-50")}
  >
    {conversation?.visible && showVoiceFeedback ? (
      <GlassSurface borderRadius={24}>
        <InlineVoiceControls conversation={conversation} />
      </GlassSurface>
    ) : null}
    <View className="w-full flex-row items-center justify-center gap-2">
      {analysis && analysis.status !== "unsupported" ? (
        <GlassSurface borderRadius={24}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={formatCodeAnalysisLabel(analysis)}
            disabled={!onProblems}
            onPress={onProblems}
            className="min-h-12 flex-row items-center gap-2 px-3 active:opacity-80"
          >
            <Icon
              family="Feather"
              name={
                analysis.status === "unavailable"
                  ? "alert-circle"
                  : "alert-triangle"
              }
              size={18}
              accessible={false}
              className="text-foreground"
            />
            {diagnosticSeverities.map((severity) => {
              const count = analysis.diagnostics.filter(
                (item) => item.severity === severity,
              ).length;
              if (count === 0) return null;
              const style = formatCodeDiagnostic(severity);
              return (
                <View
                  key={severity}
                  className="flex-row items-center gap-1"
                  accessibilityLabel={`${count} ${severity}${count === 1 ? "" : "s"}`}
                >
                  <Icon
                    family="Feather"
                    name={style.icon}
                    size={16}
                    accessible={false}
                    className={style.className}
                  />
                  <PText
                    className={cn("text-base tabular-nums", style.className)}
                  >
                    {formatCodeDiagnosticCount(count)}
                  </PText>
                </View>
              );
            })}
          </Pressable>
        </GlassSurface>
      ) : null}
      {conversation && !conversation.visible ? (
        <VoiceMicrophone conversation={conversation} compact liquidGlass />
      ) : null}
      <GlassSurface borderRadius={24}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy draft into a project"
          accessibilityHint="Chooses a project and folder for this draft"
          onPress={onCopyToProject}
          className="min-h-12 flex-row items-center gap-2 px-4 active:opacity-80"
        >
          <Icon
            family="Feather"
            name="copy"
            size={18}
            accessible={false}
            className="text-foreground"
          />
          <PText className="text-base text-foreground">Copy to project</PText>
        </Pressable>
      </GlassSurface>
      <GlassSurface borderRadius={24}>
        <View className="h-12 w-12 items-center justify-center">
          <ProjectCodeTools />
        </View>
      </GlassSurface>
    </View>
  </View>
);
