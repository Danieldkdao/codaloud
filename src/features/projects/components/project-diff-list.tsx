import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from "react-native";
import { makeMutable } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { CodeText, PText } from "@/components/ui/text";
import {
  formatProjectChangePath,
  formatProjectDiffDisclosure,
} from "../lib/formatters";
import type {
  ProjectWorkspaceDiffEntry,
  ProjectWorkspaceDiffRow,
} from "../types";
import { createProjectWorkspaceDiffRows } from "../lib/workspace-diff";
import {
  ProjectWorkspaceDiffComparison,
  ProjectWorkspaceDiffHunk,
  ProjectWorkspaceDiffLine,
} from "./project-workspace-diff-comparison";
import {
  ProjectDiffScrollRow,
  type ProjectDiffScrollState,
} from "./project-diff-scroll-row";

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

type ProjectDiffListRowProps = {
  row: ProjectWorkspaceDiffRow;
  layout: FileLayout;
  viewportWidth: number;
  expanded: boolean;
  onToggleFile: (path: string) => void;
  onContentWidth: (path: string, revision: number, width: number) => void;
};

const ProjectDiffListRow = memo(
  ({
    row,
    layout,
    viewportWidth,
    expanded,
    onToggleFile,
    onContentWidth,
  }: ProjectDiffListRowProps) => {
    switch (row.kind) {
      case "line":
        return (
          <View className="bg-card/25">
            <ProjectDiffScrollRow
              scroll={layout.scroll}
              rowKey={row.key}
              contentWidth={Math.max(viewportWidth, layout.width)}
              viewportWidth={viewportWidth}
            >
              <ProjectWorkspaceDiffLine
                line={row.line}
                path={row.path}
                revision={layout.revision}
                onContentWidth={onContentWidth}
              />
            </ProjectDiffScrollRow>
          </View>
        );
      case "hunk":
        return (
          <ProjectDiffScrollRow
            scroll={layout.scroll}
            rowKey={row.key}
            contentWidth={Math.max(viewportWidth, layout.width)}
            viewportWidth={viewportWidth}
          >
            <ProjectWorkspaceDiffHunk
              hunk={row.hunk}
              path={row.path}
              revision={layout.revision}
              onContentWidth={onContentWidth}
            />
          </ProjectDiffScrollRow>
        );
      case "comparison":
        return (
          <View className="bg-card/25">
            <ProjectWorkspaceDiffComparison
              comparison={row.comparison}
              status={row.status}
            />
          </View>
        );
      case "file": {
        const file = row.file;
        const path = formatProjectChangePath(file.path);
        const disclosure = formatProjectDiffDisclosure(file.path, expanded);
        return (
          <View className="border-t border-border bg-card/25">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={disclosure.label}
              accessibilityState={{ expanded }}
              onPress={() => onToggleFile(file.path)}
              className="min-h-12 flex-row items-center gap-3 px-4 py-4 active:opacity-60"
            >
              <View className="min-w-0 flex-1 gap-2">
                <CodeText className="text-base font-semibold text-foreground">
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
              <Icon
                family="Feather"
                name={disclosure.icon}
                size={22}
                className="text-muted-foreground"
                accessible={false}
              />
            </Pressable>
          </View>
        );
      }
    }
  },
);

export const ProjectDiffList = ({
  files,
  header,
  empty,
  accessibilityLabel,
  refreshing = false,
  onRefresh,
}: ProjectDiffListProps) => {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(
    width - insets.left - insets.right,
  );
  // State belongs to the file, outside cells that FlatList can unmount at any time.
  const [layoutState, setLayoutState] = useState<DiffLayoutState>(() => ({
    files: null,
    fontScale,
    revision: 0,
    layouts: new Map(),
  }));
  let layouts = layoutState.layouts;
  if (layoutState.files !== files || layoutState.fontScale !== fontScale) {
    const revision = layoutState.revision + 1;
    layouts = new Map(
      files.map((file) => {
        const contentKey = JSON.stringify([
          file.staged,
          file.unstaged,
          fontScale,
        ]);
        const previous = layoutState.layouts.get(file.path);
        return [
          file.path,
          previous?.contentKey === contentKey
            ? previous
            : {
                contentKey,
                revision,
                width: 0,
                scroll: makeMutable({ x: 0, owner: "" }),
              },
        ];
      }),
    );
    // Reconcile before rendering children so new native measurements cannot race
    // an effect that clears widths. Equal comparisons retain their scroll position.
    setLayoutState({ files, fontScale, revision, layouts });
  }
  const pendingWidths = useRef(
    new Map<string, { revision: number; width: number }>(),
  );
  const measurementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Text callbacks arrive per native line. Batch them so one frame of newly
  // mounted rows causes at most one list state update.
  const measureContent = useCallback(
    (path: string, revision: number, measuredWidth: number) => {
      const width = Math.ceil(measuredWidth);
      const pending = pendingWidths.current.get(path);
      pendingWidths.current.set(path, {
        revision,
        width:
          pending?.revision === revision
            ? Math.max(pending.width, width)
            : width,
      });
      if (measurementTimer.current !== null) return;
      measurementTimer.current = setTimeout(() => {
        measurementTimer.current = null;
        const measurements = [...pendingWidths.current.entries()];
        pendingWidths.current.clear();
        setLayoutState((previous) => {
          let layouts: Map<string, FileLayout> | null = null;
          for (const [measuredPath, measurement] of measurements) {
            const current = (layouts ?? previous.layouts).get(measuredPath);
            if (
              !current ||
              current.revision !== measurement.revision ||
              measurement.width <= current.width
            )
              continue;
            layouts ??= new Map(previous.layouts);
            layouts.set(measuredPath, { ...current, width: measurement.width });
          }
          return layouts ? { ...previous, layouts } : previous;
        });
      }, 16);
    },
    [],
  );
  useEffect(
    () => () => {
      if (measurementTimer.current !== null)
        clearTimeout(measurementTimer.current);
    },
    [],
  );
  // Keep disclosure state outside virtualized rows so scrolling preserves it.
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleFile = useCallback((path: string) => {
    setCollapsedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);
  const rows = useMemo(
    () => createProjectWorkspaceDiffRows(files, collapsedPaths),
    [files, collapsedPaths],
  );
  const rowRenderState = useRef({ layouts, viewportWidth, collapsedPaths });
  rowRenderState.current = { layouts, viewportWidth, collapsedPaths };
  const renderItem = useCallback<ListRenderItem<ProjectWorkspaceDiffRow>>(
    ({ item: row }) => {
      const current = rowRenderState.current;
      return (
        <ProjectDiffListRow
          row={row}
          layout={current.layouts.get(row.path)!}
          viewportWidth={current.viewportWidth}
          expanded={
            row.kind === "file" && !current.collapsedPaths.has(row.path)
          }
          onToggleFile={toggleFile}
          onContentWidth={measureContent}
        />
      );
    },
    [measureContent, toggleFile],
  );
  const keyExtractor = useCallback(
    (row: ProjectWorkspaceDiffRow) =>
      row.kind === "line"
        ? `${row.key}:${rowRenderState.current.layouts.get(row.path)!.revision}`
        : row.key,
    [],
  );
  const extraData = useMemo(
    () => ({ layouts, viewportWidth }),
    [layouts, viewportWidth],
  );

  return (
    <View
      style={{ flex: 1, marginLeft: insets.left, marginRight: insets.right }}
      onLayout={({ nativeEvent: { layout } }) => setViewportWidth(layout.width)}
    >
      <FlatList
        style={{ flex: 1 }}
        accessibilityLabel={accessibilityLabel}
        data={rows}
        keyExtractor={keyExtractor}
        initialNumToRender={24}
        maxToRenderPerBatch={24}
        windowSize={5}
        nestedScrollEnabled
        directionalLockEnabled
        removeClippedSubviews={false}
        extraData={extraData}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + 24,
        }}
        ListHeaderComponent={<View>{header}</View>}
        ListEmptyComponent={<View style={{ flex: 1 }}>{empty}</View>}
        renderItem={renderItem}
      />
    </View>
  );
};
