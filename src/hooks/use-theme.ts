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

export const useThemeColor = (name: ThemeColor): ColorValue =>
  useNativeThemeVariable(`--${name}`);

export const AppThemeContext = createContext<AppThemeState | null>(null);

export const useTheme = () => {
  const theme = use(AppThemeContext);
  if (!theme) throw new Error("useTheme must be used within AppThemeProvider");
  return theme;
};
