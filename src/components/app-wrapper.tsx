import { cn } from "@/lib/utils";
import { ScrollView, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AppWrapperProps = ScrollViewProps & {
  /** Whether the navigator already reserves space for a visible header. */
  headerShown?: boolean;
};

export const AppWrapper = ({
  children,
  className,
  contentContainerStyle,
  headerShown = false,
  ...props
}: AppWrapperProps) => {
  const insets = useSafeAreaInsets();
  // iOS adjusts all edges natively. Android and web need explicit safe padding;
  // their visible stack header already includes the top safe area.
  const useNativeInsets = process.env.EXPO_OS === "ios";

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      {...props}
      className={cn("flex-1 bg-background", className)}
      contentContainerStyle={[
        {
          flexGrow: 1,
          paddingTop: 24 + (useNativeInsets || headerShown ? 0 : insets.top),
          paddingBottom: 24 + (useNativeInsets ? 0 : insets.bottom),
          paddingLeft: 24 + (useNativeInsets ? 0 : insets.left),
          paddingRight: 24 + (useNativeInsets ? 0 : insets.right),
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
};
