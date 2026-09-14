import { useCallback, useState, type RefObject } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ContentSheet } from "@/components/ui/content-sheet";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { formatWorkspaceSearch } from "@/features/projects/lib/formatters";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { ProjectWorkspaceSearch } from "./project-workspace-search";
import { useProjectWorkspaceFileSearch } from "@/features/projects/hooks/use-project-workspace-file-search";

type SearchFilterRowProps = {
  label: string;
  description: string;
  icon: "file" | "file-text" | "folder";
  value: boolean;
  onValueChange: (value: boolean) => void;
};

const SearchFilterRow = ({
  label,
  description,
  icon,
  value,
  onValueChange,
}: SearchFilterRowProps) => {
  const primary = useThemeColor("primary");
  const border = useThemeColor("border");
  const [switchValue, setSwitchValue] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);

  // Overlay props arrive in a later commit. A native switch must receive its
  // new value immediately or RN sends a command that reverses the gesture.
  // Reconcile external changes before the native switch renders.
  if (previousValue !== value) {
    setPreviousValue(value);
    setSwitchValue(value);
  }

  return (
    <View className="gap-2 px-4 py-4">
      <View className="flex-row items-center gap-3">
        <Icon
          family="Feather"
          name={icon}
          size={22}
          className="text-foreground"
          accessible={false}
        />
        <PText className="min-w-0 flex-1 text-lg font-medium text-foreground">
          {label}
        </PText>
        <Switch
          accessibilityLabel={label}
          accessibilityHint={description}
          value={switchValue}
          onValueChange={(nextValue) => {
            setSwitchValue(nextValue);
            onValueChange(nextValue);
          }}
          trackColor={{ false: border, true: primary }}
          ios_backgroundColor={border}
        />
      </View>
      <PText className="text-base text-muted-foreground">
        {description}
      </PText>
    </View>
  );
};

export const ProjectWorkspaceFileSearch = ({
  anchorRef,
}: {
  anchorRef: RefObject<View | null>;
}) => {
  const [open, setOpen] = useState(false);
  const { query, setQuery, title, setTitle, content, setContent, currentFolder, setCurrentFolder } = useProjectWorkspaceFileSearch();
  const card = useThemeColor("card");
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const close = () => setOpen(false);
  const onSearchOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) setOpen(false);
  }, []);

  return (
    <ProjectWorkspaceSearch
      anchorRef={anchorRef}
      onOpenChange={onSearchOpenChange}
      value={query}
      onDraftChange={setQuery}
      {...formatWorkspaceSearch("files")}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search filters"
          accessibilityHint="Choose file title, file content, or current folder"
          accessibilityState={{ expanded: open, selected: title || content || currentFolder }}
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
          className={cn(
            "size-12 items-center justify-center rounded-full active:bg-secondary",
            (title || content || currentFolder) && "bg-secondary",
          )}
        >
          <Icon
            family="Feather"
            name="filter"
            size={20}
            className="text-foreground"
            accessible={false}
          />
        </Pressable>
      }
    >
      <ContentSheet open={open} onOpenChange={setOpen} backgroundColor={card}>
        <ScrollView
          style={{ width, maxHeight: Math.max(160, height - insets.top - 80) }}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingLeft: 20 + insets.left,
            paddingRight: 20 + insets.right,
            paddingBottom: 12,
          }}
          accessibilityViewIsModal
          onAccessibilityEscape={close}
        >
          <View>
            <SearchFilterRow
              label="File title"
              description="Find files whose names match your search."
              icon="file"
              value={title}
              onValueChange={setTitle}
            />
            <View className="mx-4 border-t border-border" />
            <SearchFilterRow
              label="File content"
              description="Find files containing your search text."
              icon="file-text"
              value={content}
              onValueChange={setContent}
            />
            <View className="mx-4 border-t border-border" />
            <SearchFilterRow
              label="Current folder"
              description="Limit searches to this folder and its subfolders, the default when all filters are off."
              icon="folder"
              value={currentFolder}
              onValueChange={setCurrentFolder}
            />
          </View>
        </ScrollView>
      </ContentSheet>
    </ProjectWorkspaceSearch>
  );
};
