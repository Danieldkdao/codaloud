import { useCallback, useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { makeMutable } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { CodeText, PText } from "@/components/ui/text";
import { formatProjectChangePath, formatProjectDiffDisclosure } from "../lib/formatters";
import type { ProjectWorkspaceDiffEntry } from "../types";
import { createProjectWorkspaceDiffRows } from "../lib/workspace-diff";
import { ProjectWorkspaceDiffComparison, ProjectWorkspaceDiffLine } from "./project-workspace-diff-comparison";
import { ProjectDiffScrollRow, type ProjectDiffScrollState } from "./project-diff-scroll-row";

type ProjectDiffListProps = {
  files: ProjectWorkspaceDiffEntry[];
  header: ReactNode;
  empty?: ReactNode;
  accessibilityLabel: string;
  refreshing?: boolean;
  onRefresh?: () => void;
};

type FileLayout = {
  contentKey: string;
  revision: number;
  width: number;
  scroll: ProjectDiffScrollState;
};

type DiffLayoutState = {
  files: ProjectWorkspaceDiffEntry[] | null;
  fontScale: number;
  revision: number;
  layouts: ReadonlyMap<string, FileLayout>;
};

export const ProjectDiffList = ({ files, header, empty, accessibilityLabel, refreshing = false, onRefresh }: ProjectDiffListProps) => {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(width - insets.left - insets.right);
  // State belongs to the file, outside cells that FlatList can unmount at any time.
  const [layoutState, setLayoutState] = useState<DiffLayoutState>(() => ({
    files: null, fontScale, revision: 0, layouts: new Map(),
  }));
  let layouts = layoutState.layouts;
  if (layoutState.files !== files || layoutState.fontScale !== fontScale) {
    const revision = layoutState.revision + 1;
    layouts = new Map(files.map((file) => {
      const contentKey = JSON.stringify([file.staged, file.unstaged, fontScale]);
      const previous = layoutState.layouts.get(file.path);
      return [file.path, previous?.contentKey === contentKey ? previous : {
        contentKey, revision, width: 0, scroll: makeMutable({ x: 0, owner: "" }),
      }];
    }));
    // Reconcile before rendering children so new native measurements cannot race
    // an effect that clears widths. Equal comparisons retain their scroll position.
    setLayoutState({ files, fontScale, revision, layouts });
  }
  // Native measurements include font scaling and wide glyphs. Every row in a
  // file gets the same width so even a short row can pan to its longest line.
  const measureContent = useCallback((path: string, revision: number, measuredWidth: number) => {
    setLayoutState((previous) => {
      const layout = previous.layouts.get(path);
      // Discard late events from replaced or removed comparisons, even if their
      // old content has since returned at the same path.
      if (!layout || layout.revision !== revision) return previous;
      const width = Math.ceil(measuredWidth);
      if (width <= layout.width) return previous;
      return { ...previous, layouts: new Map(previous.layouts).set(path, { ...layout, width }) };
    });
  }, []);
  // Keep disclosure state outside virtualized rows so scrolling preserves it.
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFile = (path: string) => {
    setCollapsedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const rows = useMemo(() => createProjectWorkspaceDiffRows(files, collapsedPaths), [files, collapsedPaths]);

  return (
    <View
      style={{ flex: 1, marginLeft: insets.left, marginRight: insets.right }}
      onLayout={({ nativeEvent: { layout } }) => setViewportWidth(layout.width)}
    >
      <FlatList
        style={{ flex: 1 }}
        accessibilityLabel={accessibilityLabel}
        data={rows}
        keyExtractor={(row) => row.kind === "line" ? `${row.key}:${layouts.get(row.path)!.revision}` : row.key}
        initialNumToRender={24}
        maxToRenderPerBatch={24}
        windowSize={5}
        nestedScrollEnabled
        directionalLockEnabled
        removeClippedSubviews={false}
        extraData={collapsedPaths}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + 24,
        }}
        ListHeaderComponent={<View>{header}</View>}
        ListEmptyComponent={<View style={{ flex: 1 }}>{empty}</View>}
        renderItem={({ item: row }) => {
          const layout = layouts.get(row.path)!;
          switch (row.kind) {
            case "line": return (
              <View className="bg-card/25">
                <ProjectDiffScrollRow
                  scroll={layout.scroll}
                  rowKey={row.key}
                  contentWidth={Math.max(viewportWidth, layout.width)}
                  viewportWidth={viewportWidth}
                >
                  <ProjectWorkspaceDiffLine line={row.line} onContentWidth={(width) => measureContent(row.path, layout.revision, width)} />
                </ProjectDiffScrollRow>
              </View>
            );
            case "comparison": return (
              <View className="bg-card/25">
                <ProjectWorkspaceDiffComparison comparison={row.comparison} status={row.status} />
              </View>
            );
            case "file": break;
          }
          const file = row.file;
          const path = formatProjectChangePath(file.path);
          const expanded = !collapsedPaths.has(file.path);
          const disclosure = formatProjectDiffDisclosure(file.path, expanded);
          return (
            <View className="border-t border-border bg-card/25">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={disclosure.label}
                accessibilityState={{ expanded }}
                onPress={() => toggleFile(file.path)}
                className="min-h-12 flex-row items-center gap-3 px-4 py-4 active:opacity-60"
              >
                <View className="min-w-0 flex-1 gap-2">
                  <CodeText
                    className="text-base font-semibold text-foreground"
                  >
                    {path.name}
                  </CodeText>
                  <PText className="text-base text-muted-foreground">
                    {path.directory}
                  </PText>
                  {file.originalPath ? (
                    <PText className="text-base text-muted-foreground">
                      From {file.originalPath}
                    </PText>
                  ) : null}
                </View>
                <Icon family="Feather" name={disclosure.icon} size={22} className="text-muted-foreground" accessible={false} />
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
};
