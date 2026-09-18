import { useEffect, useState } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { useGitIdentity } from "../hooks/use-git-identity";
import { saveGitIdentity } from "../git-identity";

export const GitIdentityForm = () => {
  const identity = useGitIdentity();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (identity.data) { setName(identity.data.name); setEmail(identity.data.email); }
  }, [identity.data]);
  const mutation = useMutation({
    mutationFn: saveGitIdentity, networkMode: "always", retry: false,
    onSuccess: (data) => { client.setQueryData(["workspace", "git-identity"], data); },
  });
  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <PText className="font-medium">Git author</PText>
      <PText className="text-muted-foreground">This name and email appear in your commits. No account is required.</PText>
      <Input accessibilityLabel="Git author name" placeholder="Name" value={name} onChangeText={setName} editable={!identity.isPending && !mutation.isPending} />
      <Input accessibilityLabel="Git author email" placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={!identity.isPending && !mutation.isPending} />
      {(identity.error || mutation.error) && <PText accessibilityRole="alert" className="text-destructive">{identity.error?.message ?? mutation.error?.message}</PText>}
      <Button loading={mutation.isPending} disabled={identity.isPending || mutation.isPending} onPress={() => mutation.mutate({ name, email })}>Save Git author</Button>
      {mutation.isSuccess && <PText accessibilityLiveRegion="polite" className="text-muted-foreground">Saved on this device.</PText>}
    </View>
  );
};
