import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import {
  formatDraftFileType,
  formatDraftSaveState,
} from "@/features/drafts/lib/formatters";
import type { DraftLanguageData } from "@/features/drafts/types";
import type { DraftSaveState } from "@/features/drafts/hooks/use-draft-save";
import { cn } from "@/lib/utils";
import { ProjectIcon } from "@/components/project-icon";

export type DraftEditorHeaderProps = {
  filename: string;
  language: DraftLanguageData;
  saveState: DraftSaveState;
  saveMessage: string | null;
  assetLabel?: string;
  disabled?: boolean;
  onFilenameChange: (filename: string) => void;
};

export const DraftEditorHeader = ({
  filename,
  language,
  saveState,
  saveMessage,
  assetLabel,
  disabled = false,
  onFilenameChange,
}: DraftEditorHeaderProps) => {
  const statusLabel = formatDraftSaveState(saveState, saveMessage ?? undefined);

  return (
    <View className="w-full gap-2 border-b border-border px-4 py-3">
      <View className="flex-row items-center gap-2">
        <ProjectIcon name={filename} isDirectory={false} size={20} />
        <View className="min-w-0 flex-1">
          <Input
            value={filename}
            onChangeText={onFilenameChange}
            placeholder="Untitled Draft"
            accessibilityLabel="Draft filename"
            accessibilityHint="Add an extension such as .ts or .md to choose the language"
            variant="ghost"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            maxLength={255}
            editable={!disabled}
            returnKeyType="done"
            className="px-0"
          />
        </View>
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <PText
          accessibilityLiveRegion="polite"
          className={cn(
            "text-base",
            saveState === "error"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {statusLabel}
        </PText>
        <PText className="text-base text-muted-foreground">
          {assetLabel ?? formatDraftFileType(language.fileType)}
        </PText>
      </View>
    </View>
  );
};
