import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View, type TextInput } from "react-native";
import { ProjectIcon } from "@/components/project-icon";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { createProjectFileSchema, type CreateProjectFileSchema, type ProjectFileKind } from "@/features/projects/actions/file-schemas";
import { formatProjectFileKind, formatProjectFileNameAction } from "@/features/projects/lib/formatters";

type ProjectFileNameRowProps = {
  kind: ProjectFileKind;
  mode: "create" | "update";
  initialName?: string;
  existingNames: readonly string[];
  parentPath: string;
  onSubmit: (input: CreateProjectFileSchema) => Promise<void>;
  onCancel: () => void;
};

export const ProjectFileNameRow = ({ kind, mode, initialName = "", existingNames, parentPath, onSubmit, onCancel }: ProjectFileNameRowProps) => {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const submitting = useRef(false);
  const cancelling = useRef(false);
  const lastAttempt = useRef<string | null>(null);
  const mounted = useRef(true);
  const presentation = formatProjectFileKind(kind);
  const action = formatProjectFileNameAction(mode);
  const hasNameConflict = existingNames.includes(name) && !(mode === "update" && name === initialName);
  const visibleError = pending ? null : hasNameConflict
    ? "A file or folder with this name already exists. Please use a different name."
    : error;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const submit = async (source: "submit" | "blur") => {
    // Native keyboards can emit submit and blur before React renders disabled.
    if (submitting.current || cancelling.current || (source === "blur" && lastAttempt.current === name)) return;
    // Keep typing and cancellation available, but block both keyboard and blur submission.
    if (hasNameConflict) return;
    if (!name.trim()) { onCancel(); return; }
    lastAttempt.current = name;
    const input = createProjectFileSchema.safeParse({ parentPath, name, kind });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Enter a valid name.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await onSubmit(input.data);
    } catch (failure) {
      if (!mounted.current) return;
      const message = failure instanceof Error ? failure.message : "Please try again.";
      setError(message);
      Alert.alert(action.errorTitle, message, [{ text: "Try again", onPress: () => inputRef.current?.focus() }]);
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  };

  return (
    <View className="gap-2 border-b border-border bg-card px-4 py-3" accessibilityState={{ busy: pending }}>
      <View className="flex-row items-center gap-3">
        <ProjectIcon name={[parentPath, name].filter(Boolean).join("/")} isDirectory={kind === "folder"} size={28} />
        <Input
          ref={inputRef}
          autoFocus
          size="lg"
          containerClassName="flex-1"
          value={name}
          onChangeText={(value) => { setName(value); setError(null); lastAttempt.current = null; }}
          accessibilityLabel={presentation.inputLabel}
          placeholder={presentation.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          selectTextOnFocus
          returnKeyType="done"
          submitBehavior="submit"
          disabled={pending}
          invalid={visibleError !== null}
          onSubmitEditing={() => void submit("submit")}
          onBlur={() => void submit("blur")}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === "Escape" && !submitting.current) { cancelling.current = true; onCancel(); }
          }}
        />
        {pending && <ActivityIndicator className="text-primary" accessibilityLabel={action.pendingLabel} />}
        <Pressable
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel={action.cancelLabel}
          accessibilityState={{ disabled: pending }}
          className="size-12 items-center justify-center rounded-lg active:bg-secondary"
          onPressIn={() => { cancelling.current = true; }}
          onPress={() => { cancelling.current = true; onCancel(); }}
        >
          <Icon family="Feather" name="x" size={22} className="text-muted-foreground" accessible={false} />
        </Pressable>
      </View>
      {visibleError && <PText accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-destructive">{visibleError}</PText>}
    </View>
  );
};
