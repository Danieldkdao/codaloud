import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { CodeText, HeadingText, PText } from "@/components/ui/text";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { formatProjectChangeCount, formatProjectChangeLines, formatProjectChangePath, formatProjectChangeSelection } from "@/features/projects/lib/formatters";
import type { ProjectChangeData } from "@/features/projects/types";
import { cn } from "@/lib/utils";

type ChangeCheckboxProps = {
  checked: boolean | "mixed";
  label: string;
  onPress: () => void;
  children?: ReactNode;
  className?: string;
};

const ChangeCheckbox = ({ checked, label, onPress, children, className }: ChangeCheckboxProps) => (
  <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }}
    onPress={onPress} className={cn("min-h-12 flex-row items-center gap-3 rounded-xl px-2 py-3 active:bg-secondary", className)}>
    <View accessible={false} className={cn("size-6 items-center justify-center rounded-md border",
      checked ? "border-primary bg-primary" : "border-muted-foreground bg-background")}>
      {checked ? <Icon family="Feather" name={checked === "mixed" ? "minus" : "check"}
        size={16} className="text-primary-foreground" accessible={false} /> : null}
    </View>
    {children}
  </Pressable>
);

type ProjectChangesPanelProps = {
  changes: ProjectChangeData[];
};

export const ProjectChangesPanel = ({ changes }: ProjectChangesPanelProps) => {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const insets = useSafeAreaInsets();
  const tracked = changes.filter((change) => change.status !== "untracked");
  const untracked = changes.filter((change) => change.status === "untracked");
  const selectedCount = changes.filter((change) => selectedPaths.includes(change.path)).length;

  const selectionState = (changes: ProjectChangeData[]): boolean | "mixed" => {
    const count = changes.filter((change) => selectedPaths.includes(change.path)).length;
    if (count === 0) return false;
    return count === changes.length ? true : "mixed";
  };

  const toggleChanges = (changes: ProjectChangeData[]) => {
    setSelectedPaths((selected) => {
      const paths = changes.map((change) => change.path);
      return paths.every((path) => selected.includes(path))
        ? selected.filter((path) => !paths.includes(path))
        : [...new Set([...selected, ...paths])];
    });
  };

  const renderChange = (change: ProjectChangeData) => {
    const path = formatProjectChangePath(change.path);
    const lines = formatProjectChangeLines(change.additions, change.deletions);
    return (
      <View key={change.path} className="border-t border-border">
        <ChangeCheckbox checked={selectedPaths.includes(change.path)} label={`Include ${change.path}`}
          className="rounded-none px-4"
          onPress={() => toggleChanges([change])}>
          <View className="min-w-0 flex-1 gap-1">
            <CodeText className="text-base text-foreground" numberOfLines={1} ellipsizeMode="middle">{path.name}</CodeText>
            <View className="flex-row items-center gap-3">
              <PText className="min-w-0 flex-1 text-base text-muted-foreground" numberOfLines={1} ellipsizeMode="middle">{path.directory}</PText>
              <View className="shrink-0 flex-row items-center gap-2">
                <CodeText className="text-base text-success-foreground">{lines.additions}</CodeText>
                <CodeText className="text-base text-destructive">{lines.deletions}</CodeText>
              </View>
            </View>
          </View>
        </ChangeCheckbox>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === "android" ? "height" : undefined}>
      <ScrollView className="flex-1" contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingTop: 12, paddingLeft: 20 + insets.left,
          paddingRight: 20 + insets.right, paddingBottom: dockHeight + 24, gap: 20 }}
        scrollIndicatorInsets={{ bottom: dockHeight }}>
        {changes.length > 0 ? (
          <>
            <View className="rounded-3xl border border-border bg-card p-4" style={{ gap: 12 }}>
              <PText accessibilityRole="header" className="text-lg font-medium">Commit message</PText>
              <Input multiline value={message} onChangeText={setMessage} accessibilityLabel="Commit message"
                // Put the inset on the wrapper so native multiline padding cannot skew it.
                containerClassName="rounded-2xl bg-background p-3"
                style={{ fontFamily: "Outfit_400Regular", height: 48, padding: 0 }}
                scrollEnabled textAlignVertical="top"
                placeholder="Describe your changes…"
                className="min-h-0 rounded-none border-0 bg-transparent p-0 focus:border-transparent focus:outline-0" />
              <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
                <Icon family="Feather" name="git-commit" size={18} className="text-muted-foreground" accessible={false} />
                <PText className="flex-1 text-base text-muted-foreground">{formatProjectChangeSelection(selectedCount, changes.length)}</PText>
              </View>
              <Button size="lg" className="rounded-full" disabled accessibilityLabel="Commit selected changes">
                Commit selected changes
              </Button>
            </View>

            <View className="gap-2">
              <View className="flex-row items-center justify-between gap-2">
                <PText accessibilityRole="header" className="text-lg font-medium">Include in commit</PText>
                <ChangeCheckbox checked={selectionState(changes)} label="Select all changes" onPress={() => toggleChanges(changes)}>
                  <PText className="text-base font-medium">All</PText>
                </ChangeCheckbox>
              </View>
              {tracked.length > 0 ? <View className="overflow-hidden rounded-2xl border border-border bg-card">
                <View>
                  <ChangeCheckbox checked={selectionState(tracked)} label="Select tracked changes" className="rounded-none px-4" onPress={() => toggleChanges(tracked)}>
                    <PText className="flex-1 text-base font-medium">Tracked</PText>
                    <PText className="text-base text-muted-foreground">{formatProjectChangeCount(tracked.length)}</PText>
                  </ChangeCheckbox>
                </View>
                {tracked.map(renderChange)}
              </View> : null}
              {untracked.length > 0 ? <View className="mt-2 overflow-hidden rounded-2xl border border-border bg-card">
                <View>
                  <ChangeCheckbox checked={selectionState(untracked)} label="Select untracked changes" className="rounded-none px-4" onPress={() => toggleChanges(untracked)}>
                    <PText className="flex-1 text-base font-medium">Untracked</PText>
                    <PText className="text-base text-muted-foreground">{formatProjectChangeCount(untracked.length)}</PText>
                  </ChangeCheckbox>
                </View>
                {untracked.map(renderChange)}
              </View> : null}
            </View>
          </>
        ) : (
          <View className="flex-1 items-center justify-center gap-4 py-8">
            <View className="size-20 items-center justify-center rounded-3xl border border-border bg-card">
              <Icon family="Feather" name="check" size={32} className="text-secondary-foreground" accessible={false} />
            </View>
            <HeadingText accessibilityRole="header" className="text-center text-3xl">No uncommitted changes</HeadingText>
            <PText className="max-w-sm text-center text-lg text-muted-foreground">Changed and untracked files will appear here, ready for your next commit.</PText>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
