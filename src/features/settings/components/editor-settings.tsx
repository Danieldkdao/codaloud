import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { HeadingText, PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import {
  cloneElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Pressable, Switch, View } from "react-native";
import { cn } from "@/lib/utils";
import { editorFonts, editorThemes } from "../constants";
import {
  agentModelIds,
  inlineModelIds,
} from "@/features/billing/model-catalog";
import { useBillingStatus } from "@/features/billing/hooks/use-billing-status";
import { authClient } from "@/lib/auth/auth-client";
import { pathRulesAreValid } from "../lib/path-rules";
import { isReservedSyncRule } from "@/features/terminal/lib/sync-plan";
import { useEditorPreferences } from "../hooks/use-editor-preferences";
import {
  formatAiModel,
  formatEditorFontSize,
  formatEditorTabSize,
} from "../lib/formatters";
import type { EditorPreferences } from "../types";
import { GitIdentityForm } from "./git-identity-form";
import { VoiceSettings } from "./voice-settings";
import { SettingsSection } from "./settings-section";

const EditorSettingsSection = ({
  title,
  children,
  settings,
}: {
  title: string;
  children: ReactNode;
  settings: boolean;
}) => {
  if (settings) {
    return (
      <SettingsSection title={title}>
        <View className="px-4">{children}</View>
      </SettingsSection>
    );
  }

  return (
    <View>
      <HeadingText
        accessibilityRole="header"
        className="pb-2 text-xl font-semibold text-foreground"
      >
        {title}
      </HeadingText>
      {children}
    </View>
  );
};

const EditorSettingRow = ({
  label,
  description,
  children,
  requiresPaidPlan = false,
}: {
  label: string;
  description?: string;
  children: ReactElement<{ disabled?: boolean }>;
  requiresPaidPlan?: boolean;
}) => (
  <View
    className="min-h-11 gap-2 border-border py-3"
    style={{ borderBottomWidth: 0.5 }}
  >
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1 flex-col gap-0.5">
        <PText className="min-w-0 text-lg font-medium text-foreground">
          {label}
        </PText>
        {description && <PText>{description}</PText>}
      </View>
      <View
        pointerEvents={requiresPaidPlan ? "none" : "auto"}
        accessibilityElementsHidden={requiresPaidPlan}
        importantForAccessibility={
          requiresPaidPlan ? "no-hide-descendants" : "auto"
        }
        className={cn("shrink-0", requiresPaidPlan && "opacity-50")}
      >
        {requiresPaidPlan
          ? cloneElement(children, { disabled: true })
          : children}
      </View>
    </View>
    {requiresPaidPlan ? (
      <View className="self-start flex-row items-center gap-1 rounded-full bg-primary/10 px-2 py-1">
        <Icon
          family="Feather"
          name="lock"
          size={14}
          className="text-primary"
          accessible={false}
        />
        <PText className="text-base font-medium text-primary">
          Requires a paid plan
        </PText>
      </View>
    ) : null}
  </View>
);

const EditorSettingSwitch = ({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  requiresPaidPlan = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  requiresPaidPlan?: boolean;
}) => {
  const primary = useThemeColor("primary");
  const border = useThemeColor("border");

  return (
    <EditorSettingRow
      label={label}
      description={description}
      requiresPaidPlan={requiresPaidPlan}
    >
      <Switch
        value={value}
        onValueChange={(next) => {
          if (!disabled && !requiresPaidPlan) onValueChange(next);
        }}
        accessibilityLabel={label}
        trackColor={{ false: border, true: primary }}
        ios_backgroundColor={border}
        disabled={disabled || requiresPaidPlan}
      />
    </EditorSettingRow>
  );
};

const EditorSettingSelect = ({
  label,
  value,
  options,
  onSelect,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) => (
  <NativeSelect
    label={label}
    disabled={disabled}
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
          onSelect: () => {
            if (!disabled) onSelect(option);
          },
        })),
      },
    ]}
  />
);

const ModelSettingSelect = ({
  label,
  value,
  options,
  onSelect,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) => (
  <NativeSelect
    label={label}
    disabled={disabled}
    trigger={
      <View className="flex-row items-center gap-2">
        <PText>{formatAiModel(value)}</PText>
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
        options: options.map((model) => ({
          value: model,
          label: formatAiModel(model),
          onSelect: () => {
            if (!disabled) onSelect(model);
          },
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
  disabled = false,
}: {
  value: number;
  min: number;
  max: number;
  displayValue: string;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  disabled?: boolean;
}) => (
  <View className="flex-row items-center gap-2">
    <PText style={{ fontVariant: ["tabular-nums"] }}>{displayValue}</PText>
    <View className="flex-row items-center rounded-lg bg-secondary/50">
      <Pressable
        disabled={disabled || value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        accessibilityState={{ disabled: disabled || value <= min }}
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
        disabled={disabled || value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        accessibilityState={{ disabled: disabled || value >= max }}
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

type EditorSettingsProps = {
  settings?: boolean;
};

export const EditorSettings = ({ settings = false }: EditorSettingsProps) => {
  const { preferences, update, error } = useEditorPreferences();
  const userId = authClient.useSession().data?.user.id;
  const { data: billing } = useBillingStatus(userId);
  const requiresPaidPlan = !billing || billing.tier === "free";
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
    allowLargeSync,
    syncAllowedPaths,
    aiDisabledPaths,
    inlineModel,
    agentModel,
    textMode,
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
      <EditorSettingsSection title="Appearance" settings={settings}>
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
      <EditorSettingsSection title="Editing" settings={settings}>
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
      <EditorSettingsSection title="Storage & AI access" settings={settings}>
        <EditorSettingSwitch
          label="Sync selected large folders"
          description="Off by default. Download only the paths listed below when enabled."
          value={allowLargeSync}
          onValueChange={(value) => change("allowLargeSync", value)}
          requiresPaidPlan={requiresPaidPlan}
        />
        {allowLargeSync && (
          <View className="gap-2 py-3">
            <PText className="text-lg font-medium text-foreground">
              Folders allowed to sync
            </PText>
            <Input
              accessibilityLabel="Folders allowed to sync"
              value={syncAllowedPaths}
              onChangeText={(value) => change("syncAllowedPaths", value)}
              disabled={requiresPaidPlan}
              multiline
              maxLength={4096}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ minHeight: 150, textAlignVertical: "top" }}
              className="bg-card/70"
            />
            <PText>
              One folder or project-relative path per line. Large projects may
              use significant device storage. Selected files can be up to 128
              MiB; each project can sync up to 100,000 files.
            </PText>
            {!pathRulesAreValid(syncAllowedPaths) ? (
              <PText className="text-destructive">
                Use at most 30 unique project-relative paths. Only a trailing *
                wildcard is supported.
              </PText>
            ) : null}
            {pathRulesAreValid(syncAllowedPaths) &&
            syncAllowedPaths
              .split(/\r?\n/)
              .some((line) => isReservedSyncRule(line.trim())) ? (
              <PText className="text-destructive">
                Git metadata is managed by the app and cannot be selected for
                file sync.
              </PText>
            ) : null}
          </View>
        )}
        <View className="gap-2 py-3">
          <PText className="text-lg font-medium text-foreground">
            Disabled files / folders for AI
          </PText>
          <Input
            accessibilityLabel="Disabled files and folders for AI"
            value={aiDisabledPaths}
            onChangeText={(value) => change("aiDisabledPaths", value)}
            multiline
            maxLength={4096}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ minHeight: 150, textAlignVertical: "top" }}
            className="bg-card/70"
          />
          <PText>
            AI cannot read or edit these paths. While this list has entries, AI
            terminal and Git tools are disabled. Your own terminal still works.
          </PText>
          {!pathRulesAreValid(aiDisabledPaths) ? (
            <PText className="text-destructive">
              Fix this list before using AI tools. Use at most 30 unique paths
              and only a trailing * wildcard.
            </PText>
          ) : null}
        </View>
      </EditorSettingsSection>
      <EditorSettingsSection title="AI models" settings={settings}>
        <EditorSettingRow
          label="Inline edits"
          description="Choose a fast model for voice editor suggestions."
          requiresPaidPlan={requiresPaidPlan}
        >
          <ModelSettingSelect
            label="Inline edit model"
            value={inlineModel}
            options={inlineModelIds}
            onSelect={(model) =>
              change("inlineModel", model as EditorPreferences["inlineModel"])
            }
          />
        </EditorSettingRow>
        <EditorSettingRow
          label="Agent tasks"
          description="Stronger models use more credits for the same task."
          requiresPaidPlan={requiresPaidPlan}
        >
          <ModelSettingSelect
            label="Agent task model"
            value={agentModel}
            options={agentModelIds}
            onSelect={(model) =>
              change("agentModel", model as EditorPreferences["agentModel"])
            }
          />
        </EditorSettingRow>
      </EditorSettingsSection>
      <GitIdentityForm settings={settings} />
      <EditorSettingsSection title="AI input" settings={settings}>
        <EditorSettingSwitch
          label="Text mode"
          value={textMode}
          onValueChange={(value) => change("textMode", value)}
          description="Open a text input instead of the microphone. Switch back to voice in the command bubble anytime."
        />
      </EditorSettingsSection>
      <VoiceSettings settings={settings} />
    </View>
  );
};
