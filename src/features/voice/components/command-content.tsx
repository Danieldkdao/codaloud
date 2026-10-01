import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard, Pressable, View, type TextInput } from "react-native";
import { ProjectIcon } from "@/components/project-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { commandCenter } from "../command-center";
import { navigateCommand } from "../command-navigation";
import type { FileActivitySchema } from "@/features/agent/schemas";
import { formatFileActivity } from "@/features/agent/lib/formatters";

export const CommandFileActivity = ({
  projectId,
  files,
}: {
  projectId: string;
  files: FileActivitySchema[];
}) => (
  <View className="gap-2 pb-2">
    {files.map((file) => {
      const content = (
        <>
          <ProjectIcon
            name={file.path.split("/").at(-1) ?? file.path}
            isDirectory={false}
            size={26}
          />
          <View className="min-w-0 flex-1">
            <PText numberOfLines={2}>{file.path}</PText>
            <PText className="text-muted-foreground">
              {formatFileActivity(file.status).label}
            </PText>
          </View>
        </>
      );
      return projectId.startsWith("draft:") ? (
        <View
          key={file.path}
          className="min-h-12 flex-row items-center gap-3 rounded-2xl bg-muted/40 px-3 py-2"
        >
          {content}
        </View>
      ) : (
        <Pressable
          key={file.path}
          accessibilityRole="button"
          accessibilityLabel={`Open ${file.path}`}
          onPress={() => {
            void navigateCommand(projectId, { path: file.path }).catch(
              (error: unknown) =>
                commandCenter.fail(
                  error instanceof Error
                    ? error.message
                    : "Couldn’t open this file.",
                ),
            );
          }}
          className="min-h-12 flex-row items-center gap-3 rounded-2xl bg-muted/40 px-3 py-2 active:bg-muted"
        >
          {content}
        </Pressable>
      );
    })}
  </View>
);

export const CommandTextInput = () => {
  const state = useSyncExternalStore(
    commandCenter.subscribe,
    commandCenter.getSnapshot,
  );
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (state.input) inputRef.current?.focus();
  }, [state.input]);
  const submit = (value = text) => {
    if (!value.trim() || !state.input || state.busy) return;
    const input = state.input;
    Keyboard.dismiss();
    void import("../text-command")
      .then(({ sendTextCommand }) =>
        sendTextCommand(input.projectId, value.trim(), input.mode),
      )
      .catch((error: unknown) =>
        commandCenter.fail(
          error instanceof Error ? error.message : "Command unavailable.",
        ),
      );
    setText("");
  };
  if (!state.input) return null;
  return (
    <View className="gap-2 pt-2">
      <View className="flex-row items-center gap-2">
        <Input
          ref={inputRef}
          autoFocus
          accessibilityLabel={
            state.input.mode === "quick-edit"
              ? "Describe your edit"
              : "Type a command"
          }
          placeholder={
            state.input.mode === "quick-edit"
              ? "Describe your edit…"
              : "What would you like to do?"
          }
          value={text}
          onChangeText={setText}
          maxLength={4000}
          returnKeyType="send"
          onSubmitEditing={({ nativeEvent }) => submit(nativeEvent.text)}
          editable={!state.busy}
          variant="ghost"
          className="text-lg font-serif"
          containerClassName="flex-1"
        />
        <Button
          size="icon"
          accessibilityLabel="Send command"
          disabled={!text.trim() || state.busy}
          onPress={() => submit()}
        >
          <Icon
            family="Feather"
            name="arrow-up"
            size={22}
            className="text-primary-foreground"
          />
        </Button>
      </View>
      <PText className="text-muted-foreground">
        Text uses AI credits without an audio session.
      </PText>
    </View>
  );
};

export const CommandResults = () => {
  const state = useSyncExternalStore(
    commandCenter.subscribe,
    commandCenter.getSnapshot,
  );
  const result = state.result;
  if (!result) return null;
  const open = (action: () => Promise<void> | void) => {
    void Promise.resolve()
      .then(action)
      .catch((error: unknown) =>
        commandCenter.fail(
          error instanceof Error ? error.message : "Couldn’t open this result.",
        ),
      );
  };
  return (
    <View className="gap-2 pb-3">
      <PText className="font-medium text-primary">{result.title}</PText>
      {result.kind === "output" ? (
        <PText selectable>{result.text}</PText>
      ) : result.entries.length ? (
        result.entries.map((entry) => {
          const { path, isDir } = entry;
          return (
            <Pressable
              key={path}
              accessibilityRole="button"
              accessibilityLabel={`Open ${path}`}
              onPress={() =>
                open(() => {
                  return navigateCommand(
                    result.projectId,
                    isDir ? { target: "files", path } : { path },
                  );
                })
              }
              className="min-h-12 flex-row items-center gap-3 rounded-2xl bg-muted/40 px-3 py-2 active:bg-muted"
            >
              <ProjectIcon
                name={path.split("/").at(-1) ?? path}
                isDirectory={isDir}
                size={26}
              />
              <PText className="min-w-0 flex-1" numberOfLines={2}>
                {path}
              </PText>
              <Icon
                family="Feather"
                name="chevron-right"
                size={18}
                className="text-muted-foreground"
              />
            </Pressable>
          );
        })
      ) : (
        <PText className="text-muted-foreground">No results found.</PText>
      )}
      {result.kind !== "output" && result.truncated ? (
        <PText className="text-muted-foreground">
          More results are available. Narrow your search or open the browser.
        </PText>
      ) : null}
    </View>
  );
};
