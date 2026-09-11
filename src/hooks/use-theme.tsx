import { useUnstableNativeVariable } from "nativewind";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Appearance, useColorScheme, type ColorValue } from "react-native";
import type { AppThemeState, ThemePreference } from "@/lib/types";
import { themePreferences } from "@/lib/constants";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";

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

const AppThemeContext = createContext<AppThemeState | null>(null);

const storageKey = "codaloud.theme";

const applyPreference = (preference: ThemePreference) => {
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
};

export const AppThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setStoredPreference] = useState<ThemePreference>("system");
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writes = useRef(Promise.resolve());
  const active = useRef(false);
  const systemScheme = useColorScheme();
  const isDarkMode = preference === "dark" || (preference === "system" && systemScheme === "dark");
  const background = useThemeColor("background");
  const card = useThemeColor("card");
  const text = useThemeColor("foreground");
  const primary = useThemeColor("primary");
  const border = useThemeColor("border");
  const notification = useThemeColor("destructive");

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    const restore = async () => {
      let restored: ThemePreference = "system";
      try {
        const saved = await SecureStore.getItemAsync(storageKey);
        restored = themePreferences.find((value) => value === saved) ?? "system";
      } catch {
        // An unavailable preference store must not prevent the app from opening.
      }
      if (cancelled) return;
      applyPreference(restored);
      setStoredPreference(restored);
      setIsReady(true);
    };
    void restore();
    return () => { cancelled = true; active.current = false; };
  }, []);

  const setPreference = (next: ThemePreference) => {
    if (!isReady) return;
    applyPreference(next);
    setStoredPreference(next);
    setError(null);
    // Serialize storage writes so quick taps cannot restore an older choice next launch.
    writes.current = writes.current.then(async () => {
      try {
        await SecureStore.setItemAsync(storageKey, next);
        if (active.current) setError(null);
      } catch {
        if (active.current) setError("Appearance changed, but couldn’t be saved on this device. Tap your choice to try again.");
      }
    });
  };

  const navigationTheme = {
    ...(isDarkMode ? DarkTheme : DefaultTheme),
    colors: {
      background: background as string, card: card as string, text: text as string,
      primary: primary as string, border: border as string, notification: notification as string,
    },
  };

  return (
    <AppThemeContext value={{ preference, isDarkMode, isReady, error, setPreference }}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        {children}
      </ThemeProvider>
    </AppThemeContext>
  );
};

export const useTheme = () => {
  const theme = useContext(AppThemeContext);
  if (!theme) throw new Error("useTheme must be used within AppThemeProvider");
  return theme;
};
