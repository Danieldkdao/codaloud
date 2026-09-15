import { ScrollView, View } from "react-native";

import { CodeText, PText } from "@/components/ui/text";
import {
  formatProjectChangeLines,
  formatProjectDiffLineNumber,
  formatProjectDiffMode,
  formatProjectDiffRow,
  formatProjectDiffUnavailable,
  formatProjectGitFileState,
} from "../lib/formatters";
import type { ProjectGitFileState } from "../actions/change-schemas";
import type { ProjectDiffComparison, ProjectDiffLine } from "../types";
import { cn } from "@/lib/utils";

type ProjectWorkspaceDiffComparisonProps = {
  comparison: ProjectDiffComparison;
  status: ProjectGitFileState;
};

export const ProjectWorkspaceDiffComparison = ({ comparison, status }: ProjectWorkspaceDiffComparisonProps) => {
  const counts = comparison.kind === "available" ? formatProjectChangeLines(comparison.additions, comparison.deletions) : null;

  return (
    <View className="pb-4">
      <View className="gap-2 px-4 pb-3">
        <View className="flex-row flex-wrap items-center gap-3">
          <PText className="text-base text-muted-foreground">{formatProjectGitFileState(status)}</PText>
          {counts ? (
            <>
              <CodeText className="text-base text-success-foreground">{counts.additions}</CodeText>
              <CodeText className="text-base text-destructive">{counts.deletions}</CodeText>
            </>
          ) : null}
        </View>
        {comparison.beforeMode !== comparison.afterMode && comparison.beforeMode !== "000000" && comparison.afterMode !== "000000" ? (
          <PText className="text-base text-muted-foreground">
            {formatProjectDiffMode(comparison.beforeMode)} → {formatProjectDiffMode(comparison.afterMode)}
          </PText>
        ) : null}
      </View>
      {comparison.kind === "unavailable" ? (
        <PText className="px-4 text-base text-muted-foreground">{formatProjectDiffUnavailable(comparison.reason)}</PText>
      ) : comparison.hunks.length === 0 ? (
        <PText className="px-4 text-base text-muted-foreground">No text changes.</PText>
      ) : null}
    </View>
  );
};

export const ProjectWorkspaceDiffLine = ({ line }: { line: ProjectDiffLine }) => {
  const presentation = formatProjectDiffRow(line);
  return (
    <ScrollView horizontal directionalLockEnabled nestedScrollEnabled contentContainerStyle={{ minWidth: "100%" }}>
      <View className={cn("flex-row flex-1 px-4 py-1", presentation.className)}>
        <CodeText className="min-w-12 pr-4 text-right text-base text-muted-foreground" accessible={false}>{formatProjectDiffLineNumber(line.newLine ?? line.oldLine)}</CodeText>
        <CodeText selectable accessibilityLabel={presentation.label} className={cn("text-base", presentation.textClassName)}>{presentation.prefix}{line.text || " "}</CodeText>
      </View>
    </ScrollView>
  );
};
