export type OnboardingSnapshot = {
  ready: boolean;
  hasCompletedOnboarding: boolean | null;
  error: string | null;
  isCompleting: boolean;
};

export type OnboardingStorage = {
  load: () => Promise<boolean>;
  complete: () => Promise<void>;
};

export type EditorTheme = (typeof import("./constants").editorThemes)[number];
export type EditorFont = (typeof import("./constants").editorFonts)[number];
export type EditorPreferences = {
  theme: EditorTheme;
  font: EditorFont;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  useTabs: boolean;
  keepIndentation: boolean;
  closeBrackets: boolean;
};
