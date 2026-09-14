import { ScrollView, View } from "react-native";

import { CodeText, PText } from "@/components/ui/text";
import {
  formatProjectChangeLines,
  formatProjectDiffLineNumber,
  formatProjectDiffMode,
  formatProjectDiffRow,
  formatProjectDiffScope,
  formatProjectDiffUnavailable,
  formatProjectGitFileState,
} from "../lib/formatters";
import type { ProjectGitFileState } from "../actions/change-schemas";
import type { ProjectDiffComparison } from "../types";
import { cn } from "@/lib/utils";

type ProjectWorkspaceDiffComparisonProps = {
  comparison: ProjectDiffComparison;
  status: ProjectGitFileState;
};

export const ProjectWorkspaceDiffComparison = ({ comparison, status }: ProjectWorkspaceDiffComparisonProps) => {
  const scope = formatProjectDiffScope(comparison.scope);
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
      ) : (
        <ScrollView horizontal directionalLockEnabled
          accessibilityLabel={`${scope} diff for ${comparison.afterPath ?? comparison.beforePath}`}
          contentContainerStyle={{ minWidth: "100%" }}>
          <View style={{ flexGrow: 1 }}>
            {comparison.hunks.map((hunk, hunkIndex) => (
              <View key={hunkIndex}>
                {hunk.lines.map((line, lineIndex) => {
                  const presentation = formatProjectDiffRow(line);
                  return (
                    <View key={lineIndex} className={cn("flex-row px-4 py-1", presentation.className)}>
                      <CodeText className="min-w-12 pr-4 text-right text-base text-muted-foreground" accessible={false}>{formatProjectDiffLineNumber(line.newLine ?? line.oldLine)}</CodeText>
                      <CodeText selectable accessibilityLabel={presentation.label} className={cn("flex-1 text-base", presentation.textClassName)}>{presentation.prefix}{line.text || " "}</CodeText>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
