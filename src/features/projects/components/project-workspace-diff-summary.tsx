import { Pressable, View } from "react-native";

import { CodeText, PText } from "@/components/ui/text";
import { formatProjectDiffSummary } from "../lib/formatters";
import type { ProjectWorkspaceDiffData } from "../types";

type ProjectWorkspaceDiffSummaryProps = {
  summary: ProjectWorkspaceDiffData["summary"];
  onViewFullDiff?: () => void;
};

export const ProjectWorkspaceDiffSummary = ({ summary, onViewFullDiff }: ProjectWorkspaceDiffSummaryProps) => {
  const totals = formatProjectDiffSummary(summary);

  return (
    <View className="min-w-0 shrink flex-row flex-wrap items-center justify-end gap-3">
      {onViewFullDiff ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Full Diff"
          onPress={onViewFullDiff}
          className="min-h-12 justify-center py-2 active:opacity-60"
        >
          <PText className="text-base font-medium text-muted-foreground">View Full Diff</PText>
        </Pressable>
      ) : null}
      <View className="flex-row items-center gap-2">
        {totals ? (
          <>
            <CodeText accessibilityLabel={totals.additionsLabel} className="text-base text-success-foreground">{totals.additions}</CodeText>
            <CodeText accessibilityLabel={totals.deletionsLabel} className="text-base text-destructive">{totals.deletions}</CodeText>
          </>
        ) : <CodeText accessibilityLabel="Line counts unavailable" className="text-base text-muted-foreground">—</CodeText>}
      </View>
    </View>
  );
};
