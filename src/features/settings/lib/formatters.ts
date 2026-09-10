import type { IconProps } from "@/components/ui/icon";
import type { ThemePreference } from "@/lib/types";

export const formatThemePreference = (preference: ThemePreference): {
  label: string; icon: IconProps; description: string;
} => {
  switch (preference) {
    case "light": return { label: "Light", icon: { family: "Feather", name: "sun" }, description: "A little light for your next idea." };
    case "dark": return { label: "Dark", icon: { family: "Feather", name: "moon" }, description: "A softer glow for focused work." };
    case "system": return { label: "System", icon: { family: "Feather", name: "smartphone" }, description: "Follows your device’s appearance automatically." };
  }
};

export const formatProfileInitials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toUpperCase() || "C";

export const formatAppVersion = (version?: string) => version ? `Version ${version}` : "";

export const formatThemePreviewClassName = (preference: Exclude<ThemePreference, "system">) => {
  switch (preference) {
    case "light": return "theme-light";
    case "dark": return "theme-dark";
  }
};
