import { useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import {
  formatEditorFontSize,
  formatEditorTabSize,
} from "@/features/projects/lib/formatters";
import { PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";

const editorThemes = [
  "Codaloud",
  "GitHub Light",
  "One Dark",
  "Dracula",
] as const;
const editorFonts = [
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "IBM Plex Mono",
] as const;

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
      <PText className="min-w-0 flex-1 text-base text-foreground">
        {label}
      </PText>
      <View className="shrink-0">{children}</View>
    </View>
    {description && (
      <PText className="text-base text-muted-foreground">{description}</PText>
    )}
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
        <PText className="text-base text-muted-foreground">{value}</PText>
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
    <PText
      className="text-base text-muted-foreground"
      style={{ fontVariant: ["tabular-nums"] }}
    >
      {displayValue}
    </PText>
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

export const ProjectCodeTools = () => {
  const [open, setOpen] = useState(false);
  // Mock preferences live above the sheet so dismissing it preserves selections.
  // They deliberately do not configure CodeMirror or persist to device storage.
  const [theme, setTheme] = useState<string>(editorThemes[0]);
  const [font, setFont] = useState<string>(editorFonts[0]);
  const [fontSize, setFontSize] = useState(16);
  const [tabSize, setTabSize] = useState(2);
  const [wordWrap, setWordWrap] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [useTabs, setUseTabs] = useState(false);
  const [keepIndentation, setKeepIndentation] = useState(true);
  const [closeBrackets, setCloseBrackets] = useState(true);
  const background = useThemeColor("background");
  const { height } = useWindowDimensions();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Editor tools"
        accessibilityHint="Opens editor appearance and editing settings."
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="h-13 min-w-11 max-w-16 flex-1 items-center justify-center rounded-full active:bg-secondary"
      >
        <Icon
          family="Feather"
          name="sliders"
          size={22}
          className="text-foreground"
          accessible={false}
        />
      </Pressable>
      <ContentSheet
        open={open}
        onOpenChange={setOpen}
        backgroundColor={background}
      >
        <View
          style={{ maxHeight: height * 0.85 }}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setOpen(false)}
        >
          <View className="min-h-14 flex-row items-center justify-between gap-3 border-b border-border px-5">
            <PText accessibilityRole="header" className="text-xl font-semibold">
              Editor settings
            </PText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => setOpen(false)}
              className="min-h-11 min-w-11 items-center justify-center"
            >
              <PText className="text-base font-semibold text-primary">
                Done
              </PText>
            </Pressable>
          </View>
          <ScrollView
            style={{ flexShrink: 1 }}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
              gap: 28,
            }}
          >
            <EditorSettingsSection title="Appearance">
              <EditorSettingRow label="Theme">
                <EditorSettingSelect
                  label="Theme"
                  value={theme}
                  options={editorThemes}
                  onSelect={setTheme}
                />
              </EditorSettingRow>
              <EditorSettingRow label="Font">
                <EditorSettingSelect
                  label="Font"
                  value={font}
                  options={editorFonts}
                  onSelect={setFont}
                />
              </EditorSettingRow>
              <EditorSettingRow label="Font size">
                <EditorSettingStepper
                  value={fontSize}
                  min={10}
                  max={32}
                  displayValue={formatEditorFontSize(fontSize)}
                  onChange={setFontSize}
                  decreaseLabel="Decrease font size"
                  increaseLabel="Increase font size"
                />
              </EditorSettingRow>
              <EditorSettingSwitch
                label="Word wrap"
                value={wordWrap}
                onValueChange={setWordWrap}
                description="Keep long lines within the width of the editor."
              />
              <EditorSettingSwitch
                label="Show line numbers"
                value={lineNumbers}
                onValueChange={setLineNumbers}
              />
            </EditorSettingsSection>
            <EditorSettingsSection title="Editing">
              <EditorSettingRow label="Tab size">
                <EditorSettingStepper
                  value={tabSize}
                  min={1}
                  max={8}
                  displayValue={formatEditorTabSize(tabSize, useTabs)}
                  onChange={setTabSize}
                  decreaseLabel="Decrease tab size"
                  increaseLabel="Increase tab size"
                />
              </EditorSettingRow>
              <EditorSettingSwitch
                label="Use tabs for indentation"
                value={useTabs}
                onValueChange={setUseTabs}
                description="Use tab characters instead of spaces."
              />
              <EditorSettingSwitch
                label="Keep indentation"
                value={keepIndentation}
                onValueChange={setKeepIndentation}
                description="Continue the previous line’s indentation when starting a new line."
              />
              <EditorSettingSwitch
                label="Close brackets"
                value={closeBrackets}
                onValueChange={setCloseBrackets}
                description="Insert matching brackets and quotes as you type."
              />
            </EditorSettingsSection>
          </ScrollView>
        </View>
      </ContentSheet>
    </>
  );
};
