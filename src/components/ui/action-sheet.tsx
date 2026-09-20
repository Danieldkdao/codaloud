import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from "react-native";

import { ContentSheet } from "./content-sheet";
import { Icon, type IconProps } from "./icon";
import { CodeText, PText } from "./text";
import { useThemeColor } from "@/hooks/use-theme";

export type ActionSheetItem = {
  id: string;
  label: string;
  icon: IconProps<"Feather">["name"];
  count?: number | null;
  accessibilityLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  chevron?: boolean;
  onPress?: () => void;
};

type ActionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDismiss?: () => void;
  title?: string;
  monospaceTitle?: boolean;
  items: readonly ActionSheetItem[];
};

export const ActionSheet = ({
  open,
  onOpenChange,
  onDismiss,
  title,
  monospaceTitle = false,
  items,
}: ActionSheetProps) => {
  const { width, height } = useWindowDimensions();
  const card = useThemeColor("card");
  const Title = monospaceTitle ? CodeText : PText;

  return (
    <ContentSheet
      open={open}
      onOpenChange={onOpenChange}
      onDismiss={onDismiss}
      backgroundColor={card}
    >
      <ScrollView
        style={{ width, maxHeight: height * 0.8 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 24,
        }}
        contentInsetAdjustmentBehavior="never"
        accessibilityViewIsModal
        onAccessibilityEscape={() => onOpenChange(false)}
      >
        {title && (
          <Title
            accessibilityRole="header"
            className="px-2 pb-3 text-center text-base font-medium text-foreground"
          >
            {title}
          </Title>
        )}
        <View className="h-px bg-border" />
        {items.map((item, index) => (
          <View key={item.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                item.accessibilityLabel ??
                (item.count == null
                  ? item.label
                  : `${item.label} ${item.count}`)
              }
              accessibilityState={{ disabled: item.disabled ?? false, busy: item.busy ?? false }}
              disabled={item.disabled}
              onPress={item.onPress}
              className="min-h-14 flex-row items-center gap-3 rounded-xl px-2 py-3 active:bg-secondary disabled:opacity-40"
            >
              <View className="size-8 items-center justify-center rounded-lg bg-secondary/50">
                <Icon
                  family="Feather"
                  name={item.icon}
                  size={20}
                  className="text-muted-foreground"
                  accessible={false}
                />
              </View>
              <PText className="min-w-0 flex-1 text-base font-normal text-foreground">
                {item.label}
              </PText>
              {item.count != null && (
                <View className="min-w-8 items-center justify-center rounded-full bg-secondary/50 px-2 py-1">
                  <CodeText className="text-base font-normal text-muted-foreground">
                    {item.count}
                  </CodeText>
                </View>
              )}
              {item.busy && <ActivityIndicator className="text-primary" accessibilityLabel={item.label} />}
              {item.chevron && (
                <Icon
                  family="Feather"
                  name="chevron-right"
                  size={18}
                  className="text-muted-foreground"
                  accessible={false}
                />
              )}
            </Pressable>
            {index < items.length - 1 && <View className="h-px bg-border" />}
          </View>
        ))}
      </ScrollView>
    </ContentSheet>
  );
};
