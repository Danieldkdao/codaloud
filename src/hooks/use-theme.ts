import { useUnstableNativeVariable } from "nativewind";
import { useColorScheme, type ColorValue } from "react-native";

type ThemeColor =
  | "background"
  | "foreground"
  | "navigation-shadow"
  | "primary"
  | "secondary"
  | "secondary-foreground"
  | "muted-foreground";

// NativeWind's default declarations describe its web stub, which has no arguments.
const useNativeThemeVariable = useUnstableNativeVariable as
  typeof import("react-native-css/native").useUnstableNativeVariable;

// Web consumes CSS variables directly; the native hook is unavailable on web.
export const useThemeColor: (name: ThemeColor) => ColorValue =
  process.env.EXPO_OS === "web"
    ? (name) => `var(--${name})`
    : (name) => useNativeThemeVariable(`--${name}`);

export const useTheme = () => {
  const colorScheme = useColorScheme();

  return { isDarkMode: colorScheme === "dark" };
};
