import { cn } from "@/lib/utils";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  View,
  type TextInput,
} from "react-native";
import { ProjectIcon } from "@/components/project-icon";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import {
  createProjectFileSchema,
  type CreateProjectFileSchema,
  type ProjectFileKind,
} from "@/features/projects/actions/file-schemas";
import { useProjectWorkspaceFileCreation } from "@/features/projects/hooks/use-project-workspace-file-creation";
import {
  formatProjectFileKind,
  formatProjectFileNameAction,
} from "@/features/projects/lib/formatters";

export type ProjectFileNameRowHandle = {
  submit: () => void;
  cancel: () => void;
};

type ProjectFileNameRowProps = {
  ref?: Ref<ProjectFileNameRowHandle>;
  submitOnBlur?: boolean;
  kind: ProjectFileKind;
  disabled?: boolean;
  mode: "create" | "update";
  initialName?: string;
  existingNames: readonly string[];
  parentPath: string;
  onSubmit: (input: CreateProjectFileSchema) => Promise<void>;
  onCancel: () => void;
};

export const ProjectFileNameRow = ({
  ref,
  submitOnBlur = true,
  kind,
  disabled = false,
  mode,
  initialName = "",
  existingNames,
  parentPath,
  onSubmit,
  onCancel,
}: ProjectFileNameRowProps) => {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Validation waits for submit: a name that momentarily matches a sibling
  // mid-typing must not flash an error, and typing again clears `attempted`.
  const [attempted, setAttempted] = useState(false);
  const { beginNaming, endNaming } = useProjectWorkspaceFileCreation();
  const inputRef = useRef<TextInput>(null);
  const submitting = useRef(false);
  const cancelling = useRef(false);
  const lastAttempt = useRef<string | null>(null);
  const mounted = useRef(true);
  const presentation = formatProjectFileKind(kind);
  const action = formatProjectFileNameAction(mode);
  const hasNameConflict =
    existingNames.includes(name) &&
    !(mode === "update" && name === initialName);
  const visibleError = pending
    ? null
    : attempted && hasNameConflict
      ? "A file or folder with this name already exists. Please use a different name."
      : error;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A name is being typed for as long as this row exists, whether it creates or
  // renames, so the Files toolbar can get its search bar out of the way.
  useEffect(() => {
    beginNaming();
    return endNaming;
  }, [beginNaming, endNaming]);

  // This field takes focus when it appears. Focusing during the commit that inserts
  // the row races the layout pass, so it waits for the browser's idle callback.
  useEffect(() => {
    if (disabled) return;
    const handle = requestIdleCallback(() => {
      if (mounted.current) inputRef.current?.focus();
    });
    return () => cancelIdleCallback(handle);
  }, [disabled]);

  const submit = async (source: "submit" | "blur") => {
    // Native keyboards can emit submit and blur before React renders disabled.
    if (
      disabled ||
      submitting.current ||
      cancelling.current ||
      (source === "blur" && lastAttempt.current === name)
    )
      return;
    // Keep typing and cancellation available, but block both keyboard and blur submission.
    setAttempted(true);
    if (hasNameConflict) return;
    if (!name.trim()) {
      onCancel();
      return;
    }
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
      const message =
        failure instanceof Error ? failure.message : "Please try again.";
      setError(message);
      Alert.alert(action.errorTitle, message, [
        { text: "Try again", onPress: () => inputRef.current?.focus() },
      ]);
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  };

  useImperativeHandle(ref, () => ({
    submit: () => {
      void submit("submit");
    },
    cancel: () => {
      if (disabled || submitting.current) return;
      cancelling.current = true;
      onCancel();
    },
  }));

  return (
    <View
      // Transparent so the surrounding glass surface is the only background:
      // an opaque fill here would cover the material and tint its edges.
      className="gap-2 px-3 py-2"
      accessibilityState={{ busy: pending }}
    >
      <View className="flex-row items-center gap-3">
        <ProjectIcon
          name={[parentPath, name].filter(Boolean).join("/")}
          isDirectory={kind === "folder"}
          size={28}
        />
        <Input
          ref={inputRef}
          size="lg"
          containerClassName="flex-1"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(null);
            setAttempted(false);
            lastAttempt.current = null;
          }}
          accessibilityLabel={presentation.inputLabel}
          placeholder={presentation.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          selectTextOnFocus
          returnKeyType="done"
          submitBehavior="submit"
          disabled={disabled || pending}
          invalid={visibleError !== null}
          onSubmitEditing={() => void submit("submit")}
          onBlur={() => {
            if (submitOnBlur) void submit("blur");
          }}
          onKeyPress={({ nativeEvent }) => {
            if (
              nativeEvent.key === "Escape" &&
              !disabled &&
              !submitting.current
            ) {
              cancelling.current = true;
              onCancel();
            }
          }}
          className={cn(
            "bg-transparent px-1 text-lg focus:border-transparent focus:outline-0",
            !visibleError && "border-0",
          )}
        />
        {pending && (
          <ActivityIndicator
            className="text-primary"
            accessibilityLabel={action.pendingLabel}
          />
        )}
        <Pressable
          disabled={disabled || pending}
          accessibilityRole="button"
          accessibilityLabel={action.cancelLabel}
          accessibilityState={{ disabled: disabled || pending }}
          className="size-12 items-center justify-center rounded-lg active:bg-secondary"
          onPressIn={() => {
            cancelling.current = true;
          }}
          onPress={() => {
            cancelling.current = true;
            onCancel();
          }}
        >
          <Icon
            family="Feather"
            name="x"
            size={22}
            className="text-muted-foreground"
            accessible={false}
          />
        </Pressable>
      </View>
      {visibleError && (
        <PText
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-destructive"
        >
          {visibleError}
        </PText>
      )}
    </View>
  );
};
