import { Pressable, View } from "react-native";

import { CodeText, PText } from "@/components/ui/text";
import {
  formatProjectChangeLines,
  formatProjectDiffAccessibility,
} from "@/features/projects/lib/formatters";
import type { ProjectChangeData } from "@/features/projects/types";

type ProjectWorkspaceDiffSummaryProps = {
  changes: ProjectChangeData[];
  onViewFullDiff?: () => void;
};

export const ProjectWorkspaceDiffSummary = ({
  changes,
  onViewFullDiff,
}: ProjectWorkspaceDiffSummaryProps) => {
  const totals = changes.reduce(
    (total, file) => ({
      additions: total.additions + file.additions,
      deletions: total.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
  const lines = formatProjectChangeLines(totals.additions, totals.deletions);
  const labels = formatProjectDiffAccessibility(
    totals.additions,
    totals.deletions,
  );

  return (
    <View className="flex-row items-center justify-end gap-4">
      {onViewFullDiff ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Full Diff"
          onPress={onViewFullDiff}
          className="min-h-12 justify-center py-2 active:opacity-60"
        >
          <PText className="text-base font-medium text-muted-foreground">
            View Full Diff
          </PText>
        </Pressable>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-3">
        <CodeText
          accessibilityLabel={labels.additions}
          className="text-base text-success-foreground"
        >
          {lines.additions}
        </CodeText>
        <CodeText
          accessibilityLabel={labels.deletions}
          className="text-base text-destructive"
        >
          {lines.deletions}
        </CodeText>
      </View>
    </View>
  );
};
