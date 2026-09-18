import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ProjectIcon } from "@/components/project-icon";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import {
  formatProjectChangeCount,
  formatProjectChangePath,
  formatProjectEditorTab,
  formatProjectEditorTabStyle,
} from "../lib/formatters";

type ProjectCodeTabsProps = {
  paths: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onOpenFile: () => void;
  disabled?: boolean;
  closingPath?: string | null;
};

export const ProjectCodeTabs = ({
  paths,
  activePath,
  onSelect,
  onClose,
  onOpenFile,
  disabled,
  closingPath,
}: ProjectCodeTabsProps) => {
  const [open, setOpen] = useState(false);
  const strip = useRef<ScrollView>(null);
  const positions = useRef(new Map<string, number>());
  const card = useThemeColor("card");
  const revealActive = () => {
    const x = activePath ? positions.current.get(activePath) : undefined;
    if (x !== undefined)
      strip.current?.scrollTo({ x: Math.max(0, x - 12), animated: true });
  };
  useEffect(revealActive, [activePath]);
  const choose = (path: string) => {
    setOpen(false);
    onSelect(path);
  };
  const openFile = () => {
    setOpen(false);
    onOpenFile();
  };

  return (
    <>
      <View className="flex-row items-center border-b border-border bg-background">
        <ScrollView
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          onContentSizeChange={revealActive}
        >
          {paths.map((path) => {
            const selected = activePath === path;
            const label = formatProjectEditorTab(path, paths);
            const style = formatProjectEditorTabStyle(selected);
            return (
              <View
                key={path}
                onLayout={({ nativeEvent }) => {
                  positions.current.set(path, nativeEvent.layout.x);
                  if (selected) revealActive();
                }}
                className={`flex-row items-center border-b-2 ${style.container}`}
              >
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={path}
                  accessibilityState={{ selected }}
                  disabled={disabled}
                  onPress={() => onSelect(path)}
                  className="min-h-14 flex-row items-center gap-2 pl-3"
                >
                  <ProjectIcon name={path} isDirectory={false} size={18} />
                  <View
                    className="flex-row items-center"
                    style={{ maxWidth: 180 }}
                  >
                    <PText
                      numberOfLines={1}
                      ellipsizeMode="middle"
                      className={`shrink text-base ${style.text}`}
                    >
                      {label.name}
                    </PText>
                    <PText className={`text-base ${style.text}`}>
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Close ${path}`}
                  accessibilityState={{ busy: closingPath === path }}
                  disabled={disabled || Boolean(closingPath)}
                  onPress={() => onClose(path)}
                  className="min-h-14 w-11 items-center justify-center"
                >
                  <Icon
                    family="Feather"
                    name="x"
                    size={16}
                    className="text-muted-foreground"
                  />
                </Pressable>
              </View>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open another file"
            disabled={disabled}
            onPress={openFile}
            className="size-14 items-center justify-center"
          >
            <Icon
              family="Feather"
              name="plus"
              size={22}
              className="text-foreground"
            />
          </Pressable>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${formatProjectChangeCount(paths.length)} open. Show all files.`}
          onPress={() => setOpen(true)}
          className="size-14 items-center justify-center"
        >
          <View className="size-9 items-center justify-center rounded-full bg-secondary">
            <PText className="text-base font-semibold text-secondary-foreground">
              {paths.length}
            </PText>
          </View>
        </Pressable>
      </View>
      <ContentSheet open={open} onOpenChange={setOpen} backgroundColor={card}>
        <View className="gap-3 px-4 pb-8 pt-4">
          <View className="flex-row items-center justify-between">
            <HeadingText className="text-2xl">Open files</HeadingText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss open files"
              onPress={() => setOpen(false)}
              className="size-11 items-center justify-center"
            >
              <Icon
                family="Feather"
                name="x"
                size={22}
                className="text-foreground"
              />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {paths.map((path) => {
              const label = formatProjectChangePath(path);
              return (
                <View
                  key={path}
                  className={`flex-row items-center rounded-xl ${formatProjectEditorTabStyle(path === activePath).container}`}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to ${path}`}
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
                </View>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open another file"
            disabled={disabled}
            onPress={openFile}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-full bg-secondary"
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
