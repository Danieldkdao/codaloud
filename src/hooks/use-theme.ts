import { useUnstableNativeVariable } from "nativewind";
import { createContext, use } from "react";
import { type ColorValue } from "react-native";
import type { AppThemeState } from "@/lib/types";

type ThemeColor =
  | "background"
  | "card"
  | "border"
  | "destructive"
  | "foreground"
  | "navigation-shadow"
  | "primary"
  | "primary-foreground"
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

export const AppThemeContext = createContext<AppThemeState | null>(null);

export const useTheme = () => {
  const theme = use(AppThemeContext);
  if (!theme) throw new Error("useTheme must be used within AppThemeProvider");
  return theme;
};
