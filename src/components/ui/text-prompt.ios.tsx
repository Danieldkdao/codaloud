import { useEffect } from "react";
import { Alert } from "react-native";
import type { TextPromptProps } from "./text-prompt";

export type { TextPromptProps } from "./text-prompt";

export const TextPrompt = ({
  title,
  message,
  actionText,
  defaultValue = "",
  onSubmit,
  onCancel,
}: TextPromptProps) => {
  useEffect(() => {
    let active = true;
    Alert.prompt(
      title,
      message,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            if (active) onCancel();
          },
        },
        {
          text: actionText,
          onPress: (value?: string) => {
            if (active) onSubmit(value ?? "");
          },
        },
      ],
      "plain-text",
      defaultValue,
    );
    // A native alert may outlive the screen or account that requested it.
    return () => {
      active = false;
    };
  }, [title, message, actionText, defaultValue, onSubmit, onCancel]);
  return null;
};
