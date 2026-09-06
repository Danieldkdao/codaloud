import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams } from "expo-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioItem } from "@/components/ui/radio-item";
import { PText } from "@/components/ui/text";
import { useGitHubConnected } from "@/features/accounts/hooks/use-github-connected";
import {
  createProjectFormSchema,
  type CreateProjectFormSchema,
} from "@/features/projects/actions/schemas";

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

export const ProjectForm = () => {
  const { source: initialSource, name: initialName } = useLocalSearchParams<{
    source?: string;
    name?: string;
  }>();
  const { control, handleSubmit } = useForm<CreateProjectFormSchema>({
    resolver: zodResolver(createProjectFormSchema),
    defaultValues: {
      name: typeof initialName === "string" ? initialName : "",
      source: initialSource === "github" ? "github" : "new",
    },
  });
  const [source, name] = useWatch({ control, name: ["source", "name"] });
  const { isConnected, isPending, isChecking, handleConnect } =
    useGitHubConnected(
      `/new-project?${new URLSearchParams({ source: "github", name })}`,
    );

  const onSubmit = (data: CreateProjectFormSchema) => {
    console.log(data);
  };

  return (
    <View className="w-full max-w-xl gap-4 self-center">
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
              onSubmitEditing={() => void handleSubmit(onSubmit)()}
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

      {source === "github" && (
        <View className="gap-3">
          <PText
            accessibilityLiveRegion="polite"
            className="text-muted-foreground"
          >
            {isChecking
              ? "Checking GitHub connection…"
              : isConnected
                ? "You are connected."
                : "To import a project from GitHub, you need to connect your GitHub account first and grant repository access."}
          </PText>
          {!isConnected && !isChecking && (
            <Button onPress={handleConnect} loading={isPending}>
              Click here to connect
            </Button>
          )}
        </View>
      )}

      <Button size="lg" onPress={() => void handleSubmit(onSubmit)()}>
        Create project
      </Button>
    </View>
  );
};
