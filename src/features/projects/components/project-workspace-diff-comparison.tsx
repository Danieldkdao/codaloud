import { memo, useRef } from "react";
import { View, useWindowDimensions } from "react-native";

import { CodeText, PText } from "@/components/ui/text";
import {
  formatProjectChangeLines,
  formatProjectDiffLineNumber,
  formatProjectDiffHunk,
  formatProjectDiffMode,
  formatProjectDiffRow,
  formatProjectDiffUnavailable,
  formatProjectGitFileState,
} from "../lib/formatters";
import type { ProjectGitFileState } from "../actions/change-schemas";
import type {
  ProjectDiffComparison,
  ProjectDiffHunk,
  ProjectDiffLine,
} from "../types";
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
  path: string;
  revision: number;
  onContentWidth: (path: string, revision: number, width: number) => void;
};

export const ProjectWorkspaceDiffLine = memo(
  ({ line, path, revision, onContentWidth }: ProjectWorkspaceDiffLineProps) => {
    const presentation = formatProjectDiffRow(line);
    const { fontScale } = useWindowDimensions();
    const textLeft = useRef(64);
    const textWidth = useRef(0);
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
            onContentWidth(path, revision, layout.x + textWidth.current + 16);
          }}
          onTextLayout={({ nativeEvent: { lines } }) => {
            textWidth.current = lines[0]?.width ?? 0;
            onContentWidth(
              path,
              revision,
              textLeft.current + textWidth.current + 16,
            );
          }}
          accessibilityLabel={presentation.label}
          className={cn("shrink-0 text-base", presentation.textClassName)}
        >
          {presentation.prefix}
          {line.text || " "}
        </CodeText>
      </View>
    );
  },
);

export const ProjectWorkspaceDiffHunk = memo(
  ({
    hunk,
    path,
    revision,
    onContentWidth,
  }: {
    hunk: ProjectDiffHunk;
    path: string;
    revision: number;
    onContentWidth: (path: string, revision: number, width: number) => void;
  }) => {
    const presentation = formatProjectDiffHunk(hunk);
    const { fontScale } = useWindowDimensions();
    const textLeft = useRef(16);
    const textWidth = useRef(0);
    const measurementWidth = (presentation.label.length + 1) * 32 * fontScale;
    return (
      <View className="bg-info/15 px-4 py-2">
        <CodeText
          numberOfLines={1}
          style={{ width: measurementWidth }}
          onLayout={({ nativeEvent: { layout } }) => {
            textLeft.current = layout.x;
            onContentWidth(path, revision, layout.x + textWidth.current + 16);
          }}
          onTextLayout={({ nativeEvent: { lines } }) => {
            textWidth.current = lines[0]?.width ?? 0;
            onContentWidth(
              path,
              revision,
              textLeft.current + textWidth.current + 16,
            );
          }}
          accessibilityLabel={presentation.accessibilityLabel}
          className="shrink-0 text-base text-info"
        >
          {presentation.label}
        </CodeText>
      </View>
    );
  },
);
