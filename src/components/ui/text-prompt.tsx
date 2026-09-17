import {
  AlertDialog,
  Column,
  Host,
  OutlinedTextField,
  Text,
  TextButton,
  useNativeState,
} from "@expo/ui/jetpack-compose";
import { useTheme, useThemeColor } from "@/hooks/use-theme";

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
  title, message, actionText, placeholder, defaultValue = "", onSubmit, onCancel,
}: TextPromptProps) => {
  const value = useNativeState(defaultValue);
  const { isDarkMode } = useTheme();
  const primary = useThemeColor("primary");
  const card = useThemeColor("card");
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted-foreground");

  return (
    <Host matchContents colorScheme={isDarkMode ? "dark" : "light"} seedColor={primary}>
      <AlertDialog
        onDismissRequest={onCancel}
        colors={{ containerColor: card, titleContentColor: foreground, textContentColor: muted }}
      >
        <AlertDialog.Title><Text style={{ fontSize: 20 }}>{title}</Text></AlertDialog.Title>
        <AlertDialog.Text>
          <Column verticalArrangement={{ spacedBy: 12 }}>
            <Text style={{ fontSize: 16 }}>{message}</Text>
            <OutlinedTextField
              value={value}
              autoFocus
              singleLine
              textStyle={{ fontSize: 16 }}
              keyboardOptions={{ capitalization: "sentences", imeAction: "done" }}
              keyboardActions={{ onDone: onSubmit }}
            >
              <OutlinedTextField.Label><Text style={{ fontSize: 16 }}>{placeholder}</Text></OutlinedTextField.Label>
            </OutlinedTextField>
          </Column>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton onClick={onCancel}><Text style={{ fontSize: 16 }}>Cancel</Text></TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton onClick={() => onSubmit(value.get())}><Text style={{ fontSize: 16 }}>{actionText}</Text></TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </Host>
  );
};
