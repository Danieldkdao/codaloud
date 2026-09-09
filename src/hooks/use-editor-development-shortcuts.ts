import { requireOptionalNativeModule } from "expo";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Platform } from "react-native";

type DevelopmentPreferences = {
  getPreferencesAsync: () => Promise<{ keyCommandsEnabled: boolean }>;
  setPreferencesAsync: (preferences: { keyCommandsEnabled: boolean }) => Promise<void>;
};

// Serialize native preference writes across rapid blur/focus transitions.
let preferenceUpdates = Promise.resolve();

export const useEditorDevelopmentShortcuts = () => {
  useFocusEffect(
    useCallback(() => {
      if (!__DEV__ || Platform.OS !== "ios") return;
      const preferences = requireOptionalNativeModule<DevelopmentPreferences>("DevMenuPreferences");
      if (!preferences) return;

      let restoreShortcuts = false;
      preferenceUpdates = preferenceUpdates.then(async () => {
        const { keyCommandsEnabled } = await preferences.getPreferencesAsync();
        if (!keyCommandsEnabled) return;
        // Expo's native simulator reload shortcut intercepts plain "r" in WKWebView.
        // This module is available in development builds, but not Expo Go.
        await preferences.setPreferencesAsync({ keyCommandsEnabled: false });
        restoreShortcuts = true;
      }).catch((error: unknown) => {
        console.warn("Unable to suspend development shortcuts for the editor", error);
      });

      return () => {
        preferenceUpdates = preferenceUpdates.then(async () => {
          if (restoreShortcuts) {
            await preferences.setPreferencesAsync({ keyCommandsEnabled: true });
          }
        }).catch((error: unknown) => {
          console.warn("Unable to restore development shortcuts", error);
        });
      };
    }, []),
  );
};
