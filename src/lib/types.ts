import type { themePreferences } from "./constants";

export type ThemePreference = (typeof themePreferences)[number];

export type AppThemeState = {
  preference: ThemePreference;
  isDarkMode: boolean;
  isReady: boolean;
  error: string | null;
  setPreference: (preference: ThemePreference) => void;
};

export type ApiResponse<T = never> =
  | { error: true; message: string; code?: string; data?: never }
  | { error: false; message: string; data?: T };

export type ConfirmActionOptions = {
  cancelText?: string;
  actionText: string;
  onConfirmPress: () => void;
};

export type MaterialIconOptions = {
  name: string;
  isDirectory: boolean;
  expanded?: boolean;
  light?: boolean;
};
