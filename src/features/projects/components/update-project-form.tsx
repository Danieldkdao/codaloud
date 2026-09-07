import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { ScrollView, View } from "react-native";

import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import {
  updateProjectSchema,
  type UpdateProjectSchema,
} from "@/features/projects/actions/schemas";

type UpdateProjectFormProps = {
  defaultValues: UpdateProjectSchema;
};

export const UpdateProjectForm = ({ defaultValues }: UpdateProjectFormProps) => {
  const { control, trigger } = useForm<UpdateProjectSchema>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      ...defaultValues,
      name: defaultValues.name ?? "",
    },
    mode: "onTouched",
  });

  // UI preview only: validate the fields without saving any changes.
  const validateForm = () => {
    void trigger();
  };

  return (
    <AppWrapper scrollable={false} headerShown className="flex-none shrink">
      <View className="w-full max-w-xl shrink gap-4 self-center">
        <ScrollView
          className="shrink"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="never"
        >
          <Controller
            control={control}
            name="name"
            render={({
              field: { onChange, onBlur, value, ref },
              fieldState: { error },
            }) => (
              <View className="gap-2">
                <PText
                  nativeID="update-project-name-label"
                  className="font-medium text-foreground"
                >
                  Project name
                </PText>
                <Input
                  ref={ref}
                  value={value ?? ""}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="My project"
                  accessibilityLabel="Project name"
                  accessibilityLabelledBy="update-project-name-label"
                  accessibilityHint={error?.message}
                  invalid={!!error}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  onSubmitEditing={validateForm}
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
        </ScrollView>
        <View className="shrink-0">
          <Button size="lg" onPress={validateForm}>
            Save changes
          </Button>
        </View>
      </View>
    </AppWrapper>
  );
};
