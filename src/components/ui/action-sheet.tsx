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
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 24,
        }}
        contentInsetAdjustmentBehavior="never"
        accessibilityViewIsModal
        onAccessibilityEscape={() => onOpenChange(false)}
      >
        {title && (
          <Title
            accessibilityRole="header"
            className="px-2 pb-5 text-center text-2xl font-medium text-foreground"
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
              className="min-h-20 flex-row items-center gap-4 px-2 py-4 active:bg-secondary disabled:opacity-40"
            >
              <View className="size-12 items-center justify-center rounded-2xl bg-primary/20">
                <Icon
                  family="Feather"
                  name={item.icon}
                  size={25}
                  className="text-foreground"
                  accessible={false}
                />
              </View>
              <PText className="min-w-0 flex-1 text-xl font-semibold text-foreground">
                {item.label}
              </PText>
              {item.count != null && (
                <View className="min-w-11 items-center justify-center rounded-full border border-primary/40 bg-primary/20 px-3 py-1">
                  <CodeText className="text-xl font-semibold text-foreground">
                    {item.count}
                  </CodeText>
                </View>
              )}
              {item.busy && <ActivityIndicator className="text-primary" accessibilityLabel={item.label} />}
              {item.chevron && (
                <Icon
                  family="Feather"
                  name="chevron-right"
                  size={20}
                  className="text-foreground"
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
