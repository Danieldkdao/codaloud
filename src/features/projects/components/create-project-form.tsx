import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { ScrollView, View } from "react-native";

import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioItem } from "@/components/ui/radio-item";
import { PText } from "@/components/ui/text";
import { createProjectAction } from "@/features/projects/actions/actions";
import { alert } from "@/lib/utils";
import { useGitHubConnected } from "@/services/github/hooks/use-github-connected";
import {
  createProjectFormSchema,
  type CreateProjectFormSchema,
} from "@/features/projects/actions/schemas";
import { GitHubRepositoriesSelectList } from "@/services/github/components/github-repositories-select-list";

const projectSources = [
  {
    value: "new",
    icon: "box",
    title: "New project",
    description: "Start from scratch in an empty cloud sandbox.",
  },
  {
    value: "github",
    icon: "github",
    title: "Import from GitHub",
    description: "Start with an existing GitHub repository.",
  },
] as const;

export const CreateProjectForm = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { source: initialSource, name: initialName } = useLocalSearchParams<{
    source?: string;
    name?: string;
  }>();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CreateProjectFormSchema>({
    resolver: zodResolver(createProjectFormSchema),
    defaultValues: {
      name: typeof initialName === "string" ? initialName : "",
      source: initialSource === "github" ? "github" : "new",
    },
  });
  const [source, name] = useWatch({ control, name: ["source", "name"] });
  const { isConnected, isPending, isChecking, handleConnect, connectionError } =
    useGitHubConnected(
      `/new-project?${new URLSearchParams({ source: "github", name })}`,
    );

  const onSubmit = async (data: CreateProjectFormSchema) => {
    const createdProject = await createProjectAction(data);

    if (createdProject.error) {
      if (createdProject.code === "GITHUB_RECONNECT_REQUIRED") {
        // A token may expire after selection. Refresh the picker so it offers reconnection.
        void queryClient.invalidateQueries({
          queryKey: ["github", "repositories"],
        });
      }
      alert(`Error: ${createdProject.message}`);
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    router.replace({
      pathname: "/projects/[projectId]",
      params: { projectId: createdProject.projectId },
    });
  };

  const fields = (
    <View collapsable={false} className="w-full max-w-xl gap-4 self-center">
      <Controller
        control={control}
        name="name"
        render={({
          field: { onChange, onBlur, value, ref },
          fieldState: { error },
        }) => (
          <View className="gap-2">
            <PText
              nativeID="project-name-label"
              className="font-medium text-foreground"
            >
              Project name
            </PText>
            <Input
              ref={ref}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="My project"
              accessibilityLabel="Project name"
              accessibilityLabelledBy="project-name-label"
              accessibilityHint={error?.message}
              invalid={!!error}
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!isSubmitting) void handleSubmit(onSubmit)();
              }}
            />
            {error && (
              <PText
                selectable
                accessibilityRole="alert"
                className="text-destructive"
              >
                {error.message}
              </PText>
            )}
          </View>
        )}
      />
      <Controller
        control={control}
        name="source"
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error },
        }) => (
          <View className="gap-3">
            <PText className="font-medium text-foreground">
              How would you like to start?
            </PText>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Project source"
              className="gap-3"
            >
              {projectSources.map((source) => (
                <RadioItem
                  key={source.value}
                  value={source.value}
                  selectedValue={value}
                  onValueChange={onChange}
                  onBlur={onBlur}
                  title={source.title}
                  description={source.description}
                  icon={{ family: "Feather", name: source.icon }}
                />
              ))}
            </View>
            {error && (
              <PText
                selectable
                accessibilityRole="alert"
                className="text-destructive"
              >
                {error.message}
              </PText>
            )}
          </View>
        )}
      />
    </View>
  );

  return (
    <AppWrapper scrollable={false} headerShown className="flex-none shrink">
      <View className="w-full max-w-xl shrink gap-4 self-center">
        {/* These scroll surfaces are siblings so the picker keeps its own viewport. */}
        <ScrollView
          className="shrink"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="never"
        >
          {fields}
        </ScrollView>
        {source === "github" && (
          <Controller
            control={control}
            name="repositoryId"
            defaultValue=""
            shouldUnregister
            render={({
              field: { onChange, onBlur, value },
              fieldState: { error },
            }) => (
              <View className="min-h-0 shrink gap-3">
                {isConnected && !isChecking ? (
                  <GitHubRepositoriesSelectList
                    onReconnect={handleConnect}
                    isReconnecting={isPending}
                    reconnectError={connectionError}
                    selectedRepositoryId={value || null}
                    onValueChange={(repositoryId) => {
                      onChange(repositoryId ?? "");
                      onBlur();
                    }}
                    className={error ? "border-destructive" : undefined}
                  />
                ) : (
                  <View className="gap-3">
                    <PText
                      accessibilityLiveRegion="polite"
                      className="text-muted-foreground"
                    >
                      {isChecking
                        ? "Checking GitHub connection…"
                        : "To import a project from GitHub, you need to connect your GitHub account first and grant repository access."}
                    </PText>
                    {!isChecking && (
                      <Button onPress={handleConnect} loading={isPending}>
                        Click here to connect
                      </Button>
                    )}
                  </View>
                )}
                {error && (
                  <PText
                    selectable
                    accessibilityRole="alert"
                    className="text-destructive"
                  >
                    {error.message}
                  </PText>
                )}
              </View>
            )}
          />
        )}
        <View className="shrink-0">
          <Button
            size="lg"
            disabled={isSubmitting}
            loading={isSubmitting}
            onPress={() => void handleSubmit(onSubmit)()}
          >
            Create project
          </Button>
        </View>
      </View>
    </AppWrapper>
  );
};
