import { cn } from "@/lib/utils";
import { MAIN_TAB_BAR_HEIGHT } from "@/lib/constants";
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
  /** Leaves scrollable space below content for the floating main tab bar. */
  tabBarShown?: boolean;
} & (
  | (ScrollViewProps & { scrollable?: true })
  | (ViewProps & { scrollable: false })
);

export const AppWrapper = (props: AppWrapperProps) => {
  const insets = useSafeAreaInsets();
  const { headerShown = false, tabBarShown = false } = props;
  // Only iOS ScrollViews adjust safe areas automatically. Fixed views need
  // explicit padding; a visible stack header already reserves the top inset.
  const useNativeInsets =
    props.scrollable !== false && process.env.EXPO_OS === "ios";
  const bottomInset = tabBarShown
    ? MAIN_TAB_BAR_HEIGHT + 12 + Math.max(insets.bottom, 12)
    : insets.bottom;
  const padding = {
    paddingTop: 24 + (useNativeInsets || headerShown ? 0 : insets.top),
    // Automatic iOS insets already include the bottom safe area.
    paddingBottom: 24 + bottomInset - (useNativeInsets ? insets.bottom : 0),
    paddingLeft: 24 + (useNativeInsets ? 0 : insets.left),
    paddingRight: 24 + (useNativeInsets ? 0 : insets.right),
  };

  if (props.scrollable === false) {
    const { scrollable, headerShown, tabBarShown, className, style, ...viewProps } = props;

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
    tabBarShown: scrollTabBarShown,
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
