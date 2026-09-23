import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
  type FlatListProps,
  type LayoutRectangle,
} from "react-native";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ProjectIcon } from "@/components/project-icon";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { ProjectCodeTabIndicator } from "./project-code-tab-indicator";
import { useProjectFilePaths } from "../hooks/use-project-file-paths";
import type { SaveSnapshot } from "../lib/project-file-save-document";
import {
  formatProjectChangeCount,
  formatProjectChangePath,
  formatProjectEditorTab,
  formatProjectEditorTabStyle,
} from "../lib/formatters";

type ProjectCodeTabsProps = {
  projectId: string;
  paths: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onOpenFile: () => void;
  disabled?: boolean;
  closingPath?: string | null;
  save?: SaveSnapshot;
  onRetry?: () => void;
  readError?: boolean;
};

export const ProjectCodeTabs = ({
  projectId,
  paths,
  activePath,
  onSelect,
  onClose,
  onOpenFile,
  disabled,
  closingPath,
  save,
  onRetry,
  readError = false,
}: ProjectCodeTabsProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { height } = useWindowDimensions();
  const localPaths = useProjectFilePaths(projectId, open);
  const needle = search.trim().toLowerCase();
  const visiblePaths = useMemo(
    () =>
      needle
        ? [...new Set([...paths, ...(localPaths.data ?? [])])].filter((path) =>
            path.toLowerCase().includes(needle),
          )
        : paths,
    [paths, localPaths.data, needle],
  );
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (!value) setSearch("");
  };
  const strip = useRef<FlatList<string>>(null);
  const [layouts, setLayouts] = useState(new Map<string, LayoutRectangle>());
  const viewport = useRef({ width: 0, offset: 0 });
  const activeFrame =
    activePath && paths.includes(activePath)
      ? layouts.get(activePath)
      : undefined;
  const card = useThemeColor("card");
  const revealActive = () => {
    if (!viewport.current.width || !activePath) return;
    if (!activeFrame) {
      const index = paths.indexOf(activePath);
      if (index >= 0)
        strip.current?.scrollToIndex({ index, viewPosition: 0.5 });
      return;
    }
    const { width, offset } = viewport.current;
    const target =
      activeFrame.x < offset
        ? Math.max(0, activeFrame.x - 12)
        : activeFrame.x + activeFrame.width > offset + width
          ? Math.max(
              0,
              Math.min(
                activeFrame.x - 12,
                activeFrame.x + activeFrame.width - width + 12,
              ),
            )
          : offset;
    if (target !== offset) {
      viewport.current.offset = target;
      strip.current?.scrollToOffset({ offset: target, animated: true });
    }
  };
  useEffect(revealActive, [activePath, layouts]);
  useEffect(() => {
    const openPaths = new Set(paths);
    setLayouts((current) =>
      [...current.keys()].some((path) => !openPaths.has(path))
        ? new Map([...current].filter(([path]) => openPaths.has(path)))
        : current,
    );
  }, [paths]);
  const choose = (path: string) => {
    changeOpen(false);
    onSelect(path);
  };
  const openFile = () => {
    changeOpen(false);
    onOpenFile();
  };
  // Cell layout is relative to the scrolling content; an item's inner View
  // starts at zero inside its cell and cannot position the shared indicator.
  const TabCell = useCallback(
    ({
      item,
      children,
      onLayout,
      onFocusCapture,
      style,
    }: ComponentProps<
      NonNullable<FlatListProps<string>["CellRendererComponent"]>
    >) => (
      <View
        testID={`code-tab-${item}`}
        style={style}
        {...{ onFocusCapture }}
        onLayout={(event) => {
          onLayout?.(event);
          const frame = event.nativeEvent.layout;
          setLayouts((current) => {
            const previous = current.get(item);
            if (
              previous &&
              previous.x === frame.x &&
              previous.y === frame.y &&
              previous.width === frame.width &&
              previous.height === frame.height
            )
              return current;
            return new Map(current).set(item, frame);
          });
        }}
      >
        {children}
      </View>
    ),
    [],
  );

  return (
    <>
      <View className="flex-row items-center border-b border-border bg-background">
        <FlatList
          testID="code-tab-scroll"
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1, minWidth: 0 }}
          contentContainerStyle={{ alignItems: "center", gap: 4, padding: 8 }}
          data={paths}
          keyExtractor={(path) => path}
          extraData={{ activePath, disabled, closingPath, save }}
          CellRendererComponent={TabCell}
          removeClippedSubviews={false}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            strip.current?.scrollToOffset({
              offset: index * averageItemLength,
              animated: false,
            });
          }}
          onContentSizeChange={revealActive}
          onLayout={({ nativeEvent }) => {
            viewport.current.width = nativeEvent.layout.width;
            revealActive();
          }}
          onScroll={({ nativeEvent }) => {
            viewport.current.offset = nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          renderItem={({ item: path }) => {
            const selected = activePath === path;
            const label = formatProjectEditorTab(path, paths);
            const style = formatProjectEditorTabStyle(selected);
            const content = (
              <View
                className={cn(
                  "flex-row items-center rounded-full",
                  style.tabContainer,
                )}
              >
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={path}
                  accessibilityState={{ selected }}
                  disabled={disabled}
                  onPress={() => onSelect(path)}
                  className="min-h-12 flex-row items-center gap-2 rounded-full pl-3"
                >
                  <ProjectIcon name={path} isDirectory={false} size={18} />
                  <View
                    className="flex-row items-center"
                    style={{ maxWidth: 180 }}
                  >
                    <PText
                      numberOfLines={1}
                      ellipsizeMode="middle"
                      className={cn("shrink text-base", style.text)}
                    >
                      {label.name}
                    </PText>
                    <PText className={cn("text-base", style.text)}>
                      {label.extension}
                    </PText>
                  </View>
                  {label.directory ? (
                    <PText
                      numberOfLines={1}
                      ellipsizeMode="middle"
                      className="max-w-28 text-base text-muted-foreground"
                    >
                      {label.directory}
                    </PText>
                  ) : null}
                </Pressable>
                {selected && save?.status === "error" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${readError ? "Retry opening" : "Retry saving"} ${path}`}
                    accessibilityHint={save.message}
                    disabled={disabled || !onRetry}
                    onPress={onRetry}
                    className="min-h-12 w-11 items-center justify-center rounded-full active:bg-secondary"
                  >
                    <Icon
                      family="Feather"
                      name="alert-circle"
                      size={18}
                      className="text-destructive"
                    />
                  </Pressable>
                ) : selected && save && save.status !== "saved" ? (
                  <View
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel={
                      save.status === "loading" ? "Loading file" : "Saving file"
                    }
                    className="min-h-12 w-11 items-center justify-center"
                  >
                    <ActivityIndicator
                      size="small"
                      className="text-foreground"
                    />
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Close ${path}`}
                    accessibilityState={{ busy: closingPath === path }}
                    disabled={disabled || Boolean(closingPath)}
                    onPress={() => onClose(path)}
                    className="min-h-12 w-11 items-center justify-center rounded-full active:bg-secondary"
                  >
                    <Icon
                      family="Feather"
                      name="x"
                      size={16}
                      className="text-muted-foreground"
                    />
                  </Pressable>
                )}
              </View>
            );
            return selected ? (
              <ProjectCodeTabIndicator>{content}</ProjectCodeTabIndicator>
            ) : (
              content
            );
          }}
        />
        <View className="shrink-0 pl-1">
          <GlassSurface borderRadius={24}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open another file"
              disabled={disabled}
              onPress={openFile}
              className="size-12 items-center justify-center rounded-full active:bg-secondary"
            >
              <Icon
                family="Feather"
                name="plus"
                size={22}
                className="text-foreground"
              />
            </Pressable>
          </GlassSurface>
        </View>
        <View className="shrink-0 px-1">
          <GlassSurface borderRadius={24}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${formatProjectChangeCount(paths.length)} open. Show all files.`}
              onPress={() => setOpen(true)}
              className="size-12 items-center justify-center rounded-full active:bg-secondary"
            >
              <PText className="text-base font-semibold text-foreground">
                {paths.length}
              </PText>
            </Pressable>
          </GlassSurface>
        </View>
      </View>
      <ContentSheet
        open={open}
        onOpenChange={changeOpen}
        backgroundColor={card}
      >
        <View className="gap-3 px-4 pb-8 pt-4">
          <FlatList
            style={{ maxHeight: height * 0.45 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            data={visiblePaths}
            keyExtractor={(path) => path}
            extraData={{ activePath, disabled, closingPath, paths }}
            renderItem={({ item: path }) => {
              const label = formatProjectChangePath(path);
              return (
                <View
                  key={path}
                  className={cn(
                    "flex-row items-center rounded-xl",
                    formatProjectEditorTabStyle(path === activePath).container,
                  )}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      paths.includes(path)
                        ? `Switch to ${path}`
                        : `Open ${path}`
                    }
                    disabled={disabled}
                    onPress={() => choose(path)}
                    className="min-h-18 min-w-0 flex-1 flex-row items-center gap-3 px-3 py-2"
                  >
                    <ProjectIcon name={path} isDirectory={false} />
                    <View className="min-w-0 flex-1">
                      <PText
                        numberOfLines={1}
                        className="text-base font-medium"
                      >
                        {label.name}
                      </PText>
                      <PText
                        numberOfLines={1}
                        ellipsizeMode="middle"
                        className="text-base text-muted-foreground"
                      >
                        {label.directory}
                      </PText>
                    </View>
                    {path === activePath ? (
                      <Icon
                        family="Feather"
                        name="check"
                        size={18}
                        className="text-secondary-foreground"
                      />
                    ) : null}
                  </Pressable>
                  {paths.includes(path) ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Close ${path}`}
                      disabled={disabled || Boolean(closingPath)}
                      onPress={() => onClose(path)}
                      className="size-11 items-center justify-center"
                    >
                      <Icon
                        family="Feather"
                        name="x"
                        size={18}
                        className="text-muted-foreground"
                      />
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
          />
          {needle && localPaths.isFetching ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator
                size="small"
                className="text-muted-foreground"
              />
              <PText className="text-base text-muted-foreground">
                Reading local paths…
              </PText>
            </View>
          ) : needle && localPaths.error ? (
            <View className="gap-2">
              <PText
                accessibilityRole="alert"
                className="text-base text-muted-foreground"
              >
                {localPaths.error.message}
              </PText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry path search"
                onPress={() => void localPaths.refetch()}
                className="min-h-11 justify-center"
              >
                <PText className="text-base text-primary">
                  Retry path search
                </PText>
              </Pressable>
            </View>
          ) : needle && visiblePaths.length === 0 ? (
            <PText
              accessibilityLiveRegion="polite"
              className="py-3 text-center text-base text-muted-foreground"
            >
              No matching paths
            </PText>
          ) : null}
          <View className="flex-row items-center gap-2 rounded-xl border border-input bg-background pl-3">
            <Icon
              family="Feather"
              name="search"
              size={20}
              className="text-muted-foreground"
              accessible={false}
            />
            <Input
              type="search"
              variant="ghost"
              accessibilityLabel="Search project paths"
              placeholder="Search project paths"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              containerClassName="min-w-0 flex-1"
              className="border-0 bg-background focus:border-transparent focus:outline-0"
            />
            {search ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear file search"
                onPress={() => setSearch("")}
                className="size-12 items-center justify-center"
              >
                <Icon
                  family="Feather"
                  name="x"
                  size={20}
                  className="text-muted-foreground"
                  accessible={false}
                />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open another file"
            disabled={disabled}
            onPress={openFile}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-full bg-secondary border border-primary/40"
          >
            <Icon
              family="Feather"
              name="plus"
              size={20}
              className="text-secondary-foreground"
            />
            <PText className="text-base font-medium text-secondary-foreground">
              Open another file
            </PText>
          </Pressable>
        </View>
      </ContentSheet>
    </>
  );
};
