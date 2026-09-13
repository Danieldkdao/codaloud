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

type SearchFilterRowProps = {
  label: string;
  icon: "file" | "file-text";
  value: boolean;
  onValueChange: (value: boolean) => void;
};

const SearchFilterRow = ({
  label,
  icon,
  value,
  onValueChange,
}: SearchFilterRowProps) => {
  const primary = useThemeColor("primary");
  const border = useThemeColor("border");

  return (
    <View className="min-h-16 flex-row items-center gap-3 px-4 py-4">
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
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: border, true: primary }}
        ios_backgroundColor={border}
      />
    </View>
  );
};

export const ProjectWorkspaceFileSearch = ({
  anchorRef,
}: {
  anchorRef: RefObject<View | null>;
}) => {
  const [open, setOpen] = useState(false);
  // Preview state only: neither option changes workspace requests yet.
  const [title, setTitle] = useState(false);
  const [content, setContent] = useState(false);
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
      {...formatWorkspaceSearch("files")}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search filters"
          accessibilityHint="Choose file title or file content"
          accessibilityState={{ expanded: open, selected: title || content }}
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
          className={cn(
            "size-12 items-center justify-center rounded-full active:bg-secondary",
            (title || content) && "bg-secondary",
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
              icon="file"
              value={title}
              onValueChange={setTitle}
            />
            <View className="mx-4 border-t border-border" />
            <SearchFilterRow
              label="File content"
              icon="file-text"
              value={content}
              onValueChange={setContent}
            />
          </View>
        </ScrollView>
      </ContentSheet>
    </ProjectWorkspaceSearch>
  );
};
