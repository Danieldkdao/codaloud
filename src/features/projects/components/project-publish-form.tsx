import { useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { Button } from "@/components/ui/button";
import { ContentSheet } from "@/components/ui/content-sheet";
import { RadioItem } from "@/components/ui/radio-item";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import { useGitHubConnected } from "@/services/github/hooks/use-github-connected";
import {
  publishProjectSchema,
  type PublishProjectSchema,
} from "../actions/publish-schemas";
import { useProjectGitOperation } from "../hooks/use-project-git-operation";
import { useProjectGitRemote } from "../hooks/use-project-git-remote";
import { usePublishProject } from "../hooks/use-publish-project";
import {
  formatProjectRepositoryName,
  formatProjectRepositoryVisibility,
} from "../lib/formatters";

export const ProjectPublishForm = ({
  open,
  onOpenChange,
  projectName,
  enabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  enabled: boolean;
}) => {
  const { projectId, isWorkspaceBusy, run } = useProjectGitOperation();
  const git = useProjectGitRemote(projectId, { enabled: open });
  const publish = usePublishProject(projectId);
  const connection = useGitHubConnected();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<PublishProjectSchema>({
    resolver: zodResolver(publishProjectSchema),
    defaultValues: {
      name: formatProjectRepositoryName(projectName),
      description: "",
      private: true,
    },
  });
  const submitting = useRef(false);
  const { width, height } = useWindowDimensions();
  const card = useThemeColor("card");
  const busy = isSubmitting || publish.isPending;
  const ready =
    enabled &&
    !isWorkspaceBusy &&
    !git.error &&
    git.data?.hasRemote === false &&
    Boolean(git.data.headSha && git.data.currentBranch);
  const canSubmit =
    ready &&
    connection.isConnected &&
    !connection.isChecking &&
    !connection.isPending &&
    !busy;
  const submit = async (input: PublishProjectSchema) => {
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    try {
      const result = await run(
        "Publishing to GitHub…",
        async (assertCurrent) => {
          assertCurrent();
          return publish.mutateAsync(input);
        },
        {
          success: (result) =>
            result.warning ?? "Repository published to GitHub.",
        },
      );
      if (result) onOpenChange(false);
    } finally {
      submitting.current = false;
    }
  };

  return (
    <ContentSheet
      open={open}
      onOpenChange={onOpenChange}
      backgroundColor={card}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "android" ? "height" : undefined}
        style={{ width }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: height * 0.75 }}
        >
          <View className="gap-4 px-5 pb-6 pt-4" accessibilityViewIsModal>
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <View className="gap-2">
                  <PText className="text-base font-medium">
                    Repository name
                  </PText>
                  <Input
                    ref={field.ref}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    accessibilityLabel="Repository name"
                    placeholder="my-project"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={100}
                    editable={!busy}
                    invalid={Boolean(fieldState.error)}
                  />
                  {fieldState.error ? (
                    <PText
                      accessibilityRole="alert"
                      className="text-base text-destructive"
                    >
                      {fieldState.error.message}
                    </PText>
                  ) : null}
                </View>
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <View className="gap-2">
                  <PText className="text-base font-medium">
                    Description (optional)
                  </PText>
                  <Input
                    ref={field.ref}
                    value={field.value ?? ""}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    accessibilityLabel="Repository description"
                    placeholder="What is this project about?"
                    multiline
                    textAlignVertical="top"
                    style={{ minHeight: 96, paddingTop: 12, paddingBottom: 12 }}
                    maxLength={350}
                    editable={!busy}
                    invalid={Boolean(fieldState.error)}
                  />
                  {fieldState.error ? (
                    <PText
                      accessibilityRole="alert"
                      className="text-base text-destructive"
                    >
                      {fieldState.error.message}
                    </PText>
                  ) : null}
                </View>
              )}
            />
            <Controller
              control={control}
              name="private"
              render={({ field }) => (
                <View
                  className="gap-3"
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Repository visibility"
                >
                  <PText className="text-base font-medium">Visibility</PText>
                  {([true, false] as const).map((isPrivate) => {
                    const option = formatProjectRepositoryVisibility(isPrivate);
                    return (
                      <RadioItem
                        key={option.title}
                        value={String(isPrivate)}
                        selectedValue={String(field.value)}
                        onValueChange={(value) => field.onChange(value === "true")}
                        title={option.title}
                        description={option.description}
                        icon={{ family: "Feather", name: option.icon }}
                        disabled={busy}
                      />
                    );
                  })}
                </View>
              )}
            />
            {!connection.isConnected || connection.isChecking ? (
              <View className="gap-2">
                <PText className="text-base text-muted-foreground">
                  {connection.isChecking
                    ? "Checking GitHub connection…"
                    : "Connect GitHub to publish to your account."}
                </PText>
                <Button
                  accessibilityLabel="Connect GitHub"
                  variant="outline"
                  onPress={connection.handleConnect}
                  loading={connection.isPending}
                  disabled={busy || connection.isChecking}
                >
                  Connect GitHub
                </Button>
              </View>
            ) : null}
            {connection.connectionError ? (
              <PText
                accessibilityRole="alert"
                className="text-base text-destructive"
              >
                {connection.connectionError}
              </PText>
            ) : null}
            {!git.data?.headSha ? (
              <PText className="text-base text-muted-foreground">
                Create a commit before publishing.
              </PText>
            ) : null}
            {publish.error ? (
              <PText
                accessibilityRole="alert"
                className="text-base text-destructive"
              >
                {publish.error.message}
              </PText>
            ) : null}
            <Button
              accessibilityLabel="Publish repository"
              size="lg"
              disabled={!canSubmit}
              loading={busy}
              onPress={() => void handleSubmit(submit)()}
            >
              Publish to GitHub
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ContentSheet>
  );
};
