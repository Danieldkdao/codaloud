import type { IconProps } from "@/components/ui/icon";
import type { ThemePreference } from "@/lib/types";
import type { SupportedAccountProvider } from "../types";

export const formatThemePreference = (
  preference: ThemePreference,
): {
  label: string;
  icon: IconProps;
  description: string;
} => {
  switch (preference) {
    case "light":
      return {
        label: "Light",
        icon: { family: "Feather", name: "sun" },
        description: "A little light for your next idea.",
      };
    case "dark":
      return {
        label: "Dark",
        icon: { family: "Feather", name: "moon" },
        description: "A softer glow for focused work.",
      };
    case "system":
      return {
        label: "System",
        icon: { family: "Feather", name: "smartphone" },
        description: "Follows your device’s appearance automatically.",
      };
  }
};

export const formatAppVersion = (version?: string) =>
  version ? `Version ${version}` : "";

export const formatThemePreviewClassName = (
  preference: Exclude<ThemePreference, "system">,
) => {
  switch (preference) {
    case "light":
      return "theme-light";
    case "dark":
      return "theme-dark";
  }
};

export const formatAccountProvider = (
  provider: SupportedAccountProvider,
): string => {
  switch (provider) {
    case "github":
      return "GitHub";
    case "google":
      return "Google";
  }
};

export const formatEditorFontSize = (size: number) => `${size} pt`;

export const formatEditorTabSize = (size: number, useTabs = false) =>
  `${size} ${useTabs ? (size === 1 ? "column" : "columns") : size === 1 ? "space" : "spaces"}`;
