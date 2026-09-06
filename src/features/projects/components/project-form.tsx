import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioItem } from "@/components/ui/radio-item";
import { PText } from "@/components/ui/text";
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
  const { control, handleSubmit } = useForm<CreateProjectFormSchema>({
    resolver: zodResolver(createProjectFormSchema),
    defaultValues: { name: "", source: "new" },
  });

  const onSubmit = (data: CreateProjectFormSchema) => {
    console.log(data);
  };

  return (
    <View className="w-full max-w-xl gap-8 self-center">
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

      <Button size="lg" onPress={() => void handleSubmit(onSubmit)()}>
        Create project
      </Button>
    </View>
  );
};
