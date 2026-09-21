import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import {
  formatEditorFontSize,
  formatEditorTabSize,
} from "@/features/projects/lib/formatters";
import { useState, type ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { editorFonts, editorThemes } from "../constants";
import { useEditorPreferences } from "../hooks/use-editor-preferences";
import type { EditorPreferences } from "../types";
import { GitIdentityForm } from "./git-identity-form";

const EditorSettingsSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <View>
    <PText
      accessibilityRole="header"
      className="pb-2 text-xl font-semibold text-foreground"
    >
      {title}
    </PText>
    {children}
  </View>
);

const EditorSettingRow = ({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) => (
  <View className="gap-1 border-border py-3" style={{ borderBottomWidth: 0.5 }}>
    <View className="min-h-11 flex-row items-center gap-3">
      <PText className="min-w-0 flex-1 text-foreground">{label}</PText>
      <View className="shrink-0">{children}</View>
    </View>
    {description && <PText>{description}</PText>}
  </View>
);

const EditorSettingSwitch = ({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) => {
  const primary = useThemeColor("primary");
  const border = useThemeColor("border");

  return (
    <EditorSettingRow label={label} description={description}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ false: border, true: primary }}
        ios_backgroundColor={border}
      />
    </EditorSettingRow>
  );
};

const EditorSettingSelect = ({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onSelect: (value: string) => void;
}) => (
  <NativeSelect
    label={label}
    trigger={
      <View className="flex-row items-center gap-2">
        <PText>{value}</PText>
        <Icon
          family="Feather"
          name="chevron-down"
          size={16}
          className="text-muted-foreground"
          accessible={false}
        />
      </View>
    }
    sections={[
      {
        label,
        value,
        options: options.map((option) => ({
          value: option,
          label: option,
          onSelect: () => onSelect(option),
        })),
      },
    ]}
  />
);

const EditorSettingStepper = ({
  value,
  min,
  max,
  displayValue,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  value: number;
  min: number;
  max: number;
  displayValue: string;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) => (
  <View className="flex-row items-center gap-2">
    <PText style={{ fontVariant: ["tabular-nums"] }}>{displayValue}</PText>
    <View className="flex-row items-center rounded-lg bg-secondary/50">
      <Pressable
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        accessibilityState={{ disabled: value <= min }}
        className="size-11 items-center justify-center active:opacity-60 disabled:opacity-40"
      >
        <Icon
          family="Feather"
          name="minus"
          size={18}
          className="text-muted-foreground"
          accessible={false}
        />
      </Pressable>
      <View className="h-5 w-px bg-border" />
      <Pressable
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        accessibilityState={{ disabled: value >= max }}
        className="size-11 items-center justify-center active:opacity-60 disabled:opacity-40"
      >
        <Icon
          family="Feather"
          name="plus"
          size={18}
          className="text-muted-foreground"
          accessible={false}
        />
      </Pressable>
    </View>
  </View>
);

export const EditorSettings = () => {
  const { preferences, update, error } = useEditorPreferences();
  const [retrying, setRetrying] = useState(false);
  const {
    theme,
    font,
    fontSize,
    tabSize,
    wordWrap,
    lineNumbers,
    minimap,
    useTabs,
    keepIndentation,
    closeBrackets,
  } = preferences;

  const change = <K extends keyof EditorPreferences>(
    key: K,
    value: EditorPreferences[K],
  ) => {
    void update({ [key]: value });
  };

  const retry = async () => {
    setRetrying(true);
    await update({});
    setRetrying(false);
  };

  return (
    <View className="gap-7">
      {error ? (
        <Pressable
          disabled={retrying}
          onPress={() => void retry()}
          accessibilityRole="button"
          accessibilityLabel="Retry saving editor settings"
          className="min-h-11 disabled:opacity-50"
        >
          <PText className="text-destructive">{error}</PText>
        </Pressable>
      ) : null}
      <EditorSettingsSection title="Appearance">
        <EditorSettingRow label="Theme">
          <EditorSettingSelect
            label="Theme"
            value={theme}
            options={editorThemes}
            onSelect={(value) =>
              change("theme", value as EditorPreferences["theme"])
            }
          />
        </EditorSettingRow>
        <EditorSettingRow label="Font">
          <EditorSettingSelect
            label="Font"
            value={font}
            options={editorFonts}
            onSelect={(value) =>
              change("font", value as EditorPreferences["font"])
            }
          />
        </EditorSettingRow>
        <EditorSettingRow label="Font size">
          <EditorSettingStepper
            value={fontSize}
            min={10}
            max={32}
            displayValue={formatEditorFontSize(fontSize)}
            onChange={(value) => change("fontSize", value)}
            decreaseLabel="Decrease font size"
            increaseLabel="Increase font size"
          />
        </EditorSettingRow>
        <EditorSettingSwitch
          label="Word wrap"
          value={wordWrap}
          onValueChange={(value) => change("wordWrap", value)}
          description="Keep long lines within the width of the editor."
        />
        <EditorSettingSwitch
          label="Show line numbers"
          value={lineNumbers}
          onValueChange={(value) => change("lineNumbers", value)}
        />
        <EditorSettingSwitch
          label="Show minimap"
          value={minimap}
          onValueChange={(value) => change("minimap", value)}
          description="Show a compact overview of the file beside the editor."
        />
      </EditorSettingsSection>
      <EditorSettingsSection title="Editing">
        <EditorSettingRow label="Tab size">
          <EditorSettingStepper
            value={tabSize}
            min={1}
            max={8}
            displayValue={formatEditorTabSize(tabSize, useTabs)}
            onChange={(value) => change("tabSize", value)}
            decreaseLabel="Decrease tab size"
            increaseLabel="Increase tab size"
          />
        </EditorSettingRow>
        <EditorSettingSwitch
          label="Use tabs for indentation"
          value={useTabs}
          onValueChange={(value) => change("useTabs", value)}
          description="Use tab characters instead of spaces."
        />
        <EditorSettingSwitch
          label="Keep indentation"
          value={keepIndentation}
          onValueChange={(value) => change("keepIndentation", value)}
          description="Continue the previous line’s indentation when starting a new line."
        />
        <EditorSettingSwitch
          label="Close brackets"
          value={closeBrackets}
          onValueChange={(value) => change("closeBrackets", value)}
          description="Insert matching brackets and quotes as you type."
        />
      </EditorSettingsSection>
      <GitIdentityForm />
    </View>
  );
};
