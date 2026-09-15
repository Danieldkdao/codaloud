import { useRef } from "react";
import { View, useWindowDimensions } from "react-native";

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

export const ProjectWorkspaceDiffComparison = ({
  comparison,
  status,
}: ProjectWorkspaceDiffComparisonProps) => {
  const counts =
    comparison.kind === "available"
      ? formatProjectChangeLines(comparison.additions, comparison.deletions)
      : null;

  return (
    <View className="pb-4">
      <View className="gap-2 px-4 pb-3">
        <View className="flex-row flex-wrap items-center gap-3">
          <PText className="text-base text-muted-foreground">
            {formatProjectGitFileState(status)}
          </PText>
          {counts ? (
            <>
              <CodeText className="text-base text-success-foreground">
                {counts.additions}
              </CodeText>
              <CodeText className="text-base text-destructive">
                {counts.deletions}
              </CodeText>
            </>
          ) : null}
        </View>
        {comparison.beforeMode !== null &&
        comparison.afterMode !== null &&
        comparison.beforeMode !== comparison.afterMode &&
        comparison.beforeMode !== "000000" &&
        comparison.afterMode !== "000000" ? (
          <PText className="text-base text-muted-foreground">
            {formatProjectDiffMode(comparison.beforeMode)} →{" "}
            {formatProjectDiffMode(comparison.afterMode)}
          </PText>
        ) : null}
      </View>
      {comparison.kind === "unavailable" ? (
        <PText className="px-4 text-base text-muted-foreground">
          {formatProjectDiffUnavailable(comparison.reason)}
        </PText>
      ) : comparison.hunks.length === 0 ? (
        <PText className="px-4 text-base text-muted-foreground">
          No text changes.
        </PText>
      ) : null}
    </View>
  );
};

type ProjectWorkspaceDiffLineProps = {
  line: ProjectDiffLine;
  onContentWidth: (width: number) => void;
};

export const ProjectWorkspaceDiffLine = ({
  line,
  onContentWidth,
}: ProjectWorkspaceDiffLineProps) => {
  const presentation = formatProjectDiffRow(line);
  const { fontScale } = useWindowDimensions();
  const textLeft = useRef(64);
  const textWidth = useRef(0);
  // Give native text room to measure one unwrapped line. The viewport uses its
  // actual glyph width, not this generous measurement bound (including tabs).
  const measurementWidth =
    (line.text.length + 2 + (line.text.match(/\t/g)?.length ?? 0) * 8) *
    32 *
    fontScale;
  return (
    <View className={cn("flex-row px-4 py-1", presentation.className)}>
      <CodeText
        className="min-w-12 pr-4 text-right text-base text-muted-foreground"
        accessible={false}
      >
        {formatProjectDiffLineNumber(line.newLine ?? line.oldLine)}
      </CodeText>
      <CodeText
        selectable
        numberOfLines={1}
        style={{ width: measurementWidth }}
        onLayout={({ nativeEvent: { layout } }) => {
          textLeft.current = layout.x;
          onContentWidth(layout.x + textWidth.current + 16);
        }}
        onTextLayout={({ nativeEvent: { lines } }) => {
          textWidth.current = lines[0]?.width ?? 0;
          onContentWidth(textLeft.current + textWidth.current + 16);
        }}
        accessibilityLabel={presentation.label}
        className={cn("shrink-0 text-base", presentation.textClassName)}
      >
        {presentation.prefix}
        {line.text || " "}
      </CodeText>
    </View>
  );
};
