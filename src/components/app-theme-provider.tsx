import { AppThemeContext, useThemeColor } from "@/hooks/use-theme";
import { themePreferences } from "@/lib/constants";
import type { ThemePreference } from "@/lib/types";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";

const storageKey = "codaloud.theme";

const applyPreference = (preference: ThemePreference) => {
  if (process.env.EXPO_OS === "web") {
    // React Native Web has no Appearance.setColorScheme implementation.
    if (preference === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = preference;
    document.documentElement.style.colorScheme = preference === "system" ? "light dark" : preference;
  } else {
    Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
  }
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
        const saved = process.env.EXPO_OS === "web"
          ? localStorage.getItem(storageKey)
          : await SecureStore.getItemAsync(storageKey);
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
        if (process.env.EXPO_OS === "web") localStorage.setItem(storageKey, next);
        else await SecureStore.setItemAsync(storageKey, next);
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
