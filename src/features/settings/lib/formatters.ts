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
    case "apple":
      return "Apple";
  }
};

export const formatEditorFontSize = (size: number) => `${size} pt`;

export const formatEditorTabSize = (size: number, useTabs = false) =>
  `${size} ${useTabs ? (size === 1 ? "column" : "columns") : size === 1 ? "space" : "spaces"}`;

export const formatVoicePreviewSource = (id: string) => {
  switch (id) {
    case "JBFqnCBsd6RMkjVDRZzb":
      return require("../../../../assets/voices/george.mp3");
    case "EXAVITQu4vr4xnSDxMaL":
      return require("../../../../assets/voices/sarah.mp3");
    case "IKne3meq5aSn9XLyUdCD":
      return require("../../../../assets/voices/charlie.mp3");
    case "SAz9YHcvj6GT2YYXdXww":
      return require("../../../../assets/voices/river.mp3");
    case "pFZP5JQG7iQjIQuC4Bku":
      return require("../../../../assets/voices/lily.mp3");
  }
};
export const formatAiModel = (model: string) => {
  switch (model) {
    case "openai/gpt-5.4-mini":
      return "GPT-5.4 mini";
    case "deepseek/deepseek-v4.1-flash":
      return "DeepSeek V4.1 Flash";
    case "google/gemini-3-flash-preview":
      return "Gemini 3 Flash";
    case "anthropic/claude-haiku-4.5":
      return "Claude Haiku 4.5";
    case "anthropic/claude-sonnet-4.5":
      return "Claude Sonnet 4.5";
    default:
      return "Unknown model";
  }
};
