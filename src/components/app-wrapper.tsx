import { cn } from "@/lib/utils";
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AppWrapperProps = {
  /** Whether the navigator already reserves space for a visible header. */
  headerShown?: boolean;
} & (
  | (ScrollViewProps & { scrollable?: true })
  | (ViewProps & { scrollable: false })
);

export const AppWrapper = (props: AppWrapperProps) => {
  const insets = useSafeAreaInsets();
  const { headerShown = false } = props;
  // Only iOS ScrollViews adjust safe areas automatically. Fixed views need
  // explicit padding; a visible stack header already reserves the top inset.
  const useNativeInsets =
    props.scrollable !== false && process.env.EXPO_OS === "ios";
  const padding = {
    paddingTop: 24 + (useNativeInsets || headerShown ? 0 : insets.top),
    paddingBottom: 24 + (useNativeInsets ? 0 : insets.bottom),
    paddingLeft: 24 + (useNativeInsets ? 0 : insets.left),
    paddingRight: 24 + (useNativeInsets ? 0 : insets.right),
  };

  if (props.scrollable === false) {
    const { scrollable, headerShown, className, style, ...viewProps } = props;

    return (
      <View
        {...viewProps}
        className={cn("flex-1 bg-background", className)}
        style={[padding, style]}
      />
    );
  }

  const {
    children,
    className,
    contentContainerStyle,
    scrollable,
    headerShown: scrollHeaderShown,
    ...scrollProps
  } = props;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      {...scrollProps}
      className={cn("flex-1 bg-background", className)}
      contentContainerStyle={[
        {
          flexGrow: 1,
          ...padding,
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
};
