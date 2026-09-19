import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { useGitIdentity } from "../hooks/use-git-identity";
import {
  gitIdentitySchema,
  saveGitIdentity,
  type GitIdentitySchema,
} from "../git-identity";

export const GitIdentityForm = () => {
  const identity = useGitIdentity();
  const client = useQueryClient();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, dirtyFields, isDirty },
  } = useForm<GitIdentitySchema>({
    resolver: zodResolver(gitIdentitySchema),
    defaultValues: { name: "", email: "" },
    mode: "onTouched",
  });
  useEffect(() => {
    if (identity.data) reset(identity.data, { keepDirtyValues: true });
  }, [identity.data, reset]);
  const mutation = useMutation({
    mutationFn: saveGitIdentity,
    networkMode: "always",
    retry: false,
    onSuccess: (data) => {
      reset(data);
      client.setQueryData(["settings", "git-identity"], data);
    },
  });
  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <PText
        accessibilityRole="header"
        className="text-xl font-semibold text-foreground"
      >
        Git author
      </PText>
      <PText className="text-muted-foreground">
        This name and email appear in your commits. No account is required.
      </PText>
      <Controller
        control={control}
        name="name"
        render={({
          field: { ref, value, onChange, onBlur },
          fieldState: { error },
        }) => (
          <View className="gap-2">
            <Input
              ref={ref}
              accessibilityLabel="Git author name"
              placeholder="Name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              invalid={!!error}
              accessibilityHint={error?.message}
              editable={!identity.isPending && !isSubmitting}
            />
            {error && (
              <PText accessibilityRole="alert" className="text-destructive">
                {error.message}
              </PText>
            )}
          </View>
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({
          field: { ref, value, onChange, onBlur },
          fieldState: { error },
        }) => (
          <View className="gap-2">
            <Input
              ref={ref}
              accessibilityLabel="Git author email"
              placeholder="Email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
              keyboardType="email-address"
              invalid={!!error}
              accessibilityHint={error?.message}
              editable={!identity.isPending && !isSubmitting}
            />
            {error && (
              <PText accessibilityRole="alert" className="text-destructive">
                {error.message}
              </PText>
            )}
          </View>
        )}
      />
      {(identity.error || mutation.error) && (
        <PText accessibilityRole="alert" className="text-destructive">
          {identity.error?.message ?? mutation.error?.message}
        </PText>
      )}
      <Button
        loading={isSubmitting}
        disabled={identity.isPending || isSubmitting || !isDirty}
        onPress={() =>
          void handleSubmit(async (data) => {
            // The mutation owns the visible storage error.
            await mutation.mutateAsync(data).catch(() => undefined);
          })()
        }
      >
        Save Git author
      </Button>
      {mutation.isSuccess && Object.keys(dirtyFields).length === 0 && (
        <PText
          accessibilityLiveRegion="polite"
          className="text-muted-foreground"
        >
          Saved on this device.
        </PText>
      )}
    </View>
  );
};
