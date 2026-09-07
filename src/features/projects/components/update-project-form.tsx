import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { ScrollView, View } from "react-native";

import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { updateProjectAction } from "@/features/projects/actions/actions";
import {
  updateProjectSchema,
  type UpdateProjectSchema,
} from "@/features/projects/actions/schemas";
import { alert } from "@/lib/utils";

type UpdateProjectFormProps = {
  projectId: string;
  defaultValues: UpdateProjectSchema;
};

export const UpdateProjectForm = ({ projectId, defaultValues }: UpdateProjectFormProps) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const isMounted = useRef(true);
  const submissionInFlight = useRef(false);
  const { control, handleSubmit, formState: { isDirty, isSubmitting } } = useForm<UpdateProjectSchema>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      ...defaultValues,
      name: defaultValues.name ?? "",
    },
    mode: "onTouched",
  });

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const onSubmit = async (data: UpdateProjectSchema) => {
    const updatedProject = await updateProjectAction(projectId, data);

    if (updatedProject.error) {
      if (isMounted.current) alert(`Error: ${updatedProject.message}`);
      return;
    }

    // Refresh active lists/details and mark inactive project queries stale.
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    // The user may have dismissed the sheet while the request was in flight.
    if (isMounted.current) router.back();
  };

  const submitForm = async () => {
    // Button and keyboard events can arrive before isSubmitting rerenders.
    if (!isDirty || submissionInFlight.current) return;
    submissionInFlight.current = true;
    try {
      await handleSubmit(onSubmit)();
    } catch {
      if (isMounted.current) alert("Error: Unable to update project. Please try again.");
    } finally {
      submissionInFlight.current = false;
    }
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
                  editable={!isSubmitting}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  onSubmitEditing={() => void submitForm()}
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
          <Button
            size="lg"
            disabled={!isDirty || isSubmitting}
            loading={isSubmitting}
            onPress={() => void submitForm()}
          >
            Save changes
          </Button>
        </View>
      </View>
    </AppWrapper>
  );
};
