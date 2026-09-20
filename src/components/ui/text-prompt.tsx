import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useThemeColor } from "@/hooks/use-theme";
import { ContentSheet } from "./content-sheet";
import { Input } from "./input";
import { Button } from "./button";
import { PText } from "./text";

export type TextPromptProps = {
  title: string;
  message: string;
  actionText: string;
  placeholder: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export const TextPrompt = ({
  title,
  message,
  actionText,
  placeholder,
  defaultValue = "",
  onSubmit,
  onCancel,
}: TextPromptProps) => {
  const [value, setValue] = useState(defaultValue);
  const finished = useRef(false);
  const background = useThemeColor("card");
  const finish = (submit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (submit) onSubmit(value);
    else onCancel();
  };
  return (
    <ContentSheet
      open
      onOpenChange={(open) => {
        if (!open) finish(false);
      }}
      backgroundColor={background}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "android" ? "height" : undefined}
      >
        <View className="gap-4 px-5 pb-5 pt-3">
          <PText accessibilityRole="header" className="text-xl font-semibold">
            {title}
          </PText>
          <PText>{message}</PText>
          <Input
            autoFocus
            value={value}
            onChangeText={setValue}
            accessibilityLabel={placeholder}
            placeholder={placeholder}
            returnKeyType="done"
            onSubmitEditing={() => finish(true)}
          />
          <View className="flex-row justify-end gap-3">
            <Button variant="ghost" onPress={() => finish(false)}>
              Cancel
            </Button>
            <Button onPress={() => finish(true)}>{actionText}</Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ContentSheet>
  );
};
