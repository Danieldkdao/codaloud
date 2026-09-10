import { AppWrapper } from "@/components/app-wrapper";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useSuccessFeedback } from "@/components/success-feedback-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth/auth-client";
import { GitHubConnection } from "@/services/github/components/github-connection";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { formatAppVersion, formatProfileInitials } from "../lib/formatters";
import { AppearanceSelector } from "./appearance-selector";
import { SettingsRow, SettingsSection } from "./settings-section";

export const SettingsScreen = () => {
  const showSuccess = useSuccessFeedback();
  const { data: session } = authClient.useSession();
  const [voiceHints, setVoiceHints] = useState(true);
  const [taskNotifications, setTaskNotifications] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const primary = useThemeColor("primary");
  const border = useThemeColor("border");
  const name = session?.user.name || "Your account";
  const email = session?.user.email;
  const avatar = session?.user.image;

  return (
    <AppWrapper tabBarShown>
      <View className="w-full max-w-xl gap-6 self-center">
        <View className="gap-2">
          <HeadingText accessibilityRole="header" className="text-4xl">Settings</HeadingText>
          <PText>Make Codaloud feel like you.</PText>
        </View>

        <View className="flex-row items-center gap-4 rounded-2xl bg-card p-4" style={{ borderCurve: "continuous" }}>
          <View className="size-14 items-center justify-center overflow-hidden rounded-full bg-secondary">
            {avatar && !imageFailed ? (
              <Image source={{ uri: avatar }} style={{ width: 56, height: 56 }} contentFit="cover" onError={() => setImageFailed(true)} accessibilityLabel={`${name}’s profile photo`} />
            ) : <HeadingText className="text-2xl text-secondary-foreground">{formatProfileInitials(name)}</HeadingText>}
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <PText selectable className="text-xl font-semibold text-foreground">{name}</PText>
            {email && <PText selectable>{email}</PText>}
            <PText className="text-secondary-foreground">Personal account</PText>
          </View>
        </View>

        <SettingsSection title="Appearance">
          <AppearanceSelector />
        </SettingsSection>

        <SettingsSection title="Preferences">
          <SettingsRow label="Voice hints" icon={{ family: "Feather", name: "mic" }}>
            <Switch accessibilityLabel="Voice hints" value={voiceHints} onValueChange={setVoiceHints} trackColor={{ false: border, true: primary }} ios_backgroundColor={border} />
          </SettingsRow>
          <SettingsRow label="Task notifications" icon={{ family: "Feather", name: "bell" }} last>
            <Switch accessibilityLabel="Task notifications" value={taskNotifications} onValueChange={setTaskNotifications} trackColor={{ false: border, true: primary }} ios_backgroundColor={border} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Connections">
          <View className="p-4"><GitHubConnection /></View>
        </SettingsSection>

        <SettingsSection title="About & legal">
          <Pressable disabled accessibilityRole="button" accessibilityLabel="Privacy policy" accessibilityState={{ disabled: true }}>
            <SettingsRow label="Privacy policy" icon={{ family: "Feather", name: "shield" }}>
              <Icon family="Feather" name="chevron-right" size={18} className="text-muted-foreground" accessible={false} />
            </SettingsRow>
          </Pressable>
          <Pressable disabled accessibilityRole="button" accessibilityLabel="Terms of service" accessibilityState={{ disabled: true }}>
            <SettingsRow label="Terms of service" icon={{ family: "Feather", name: "file-text" }} last>
              <Icon family="Feather" name="chevron-right" size={18} className="text-muted-foreground" accessible={false} />
            </SettingsRow>
          </Pressable>
        </SettingsSection>

        <SettingsSection title="Danger zone">
          <SignOutButton
            accessibilityLabel="Log out"
            variant="ghost"
            className="rounded-none p-0 active:bg-destructive/10"
            contentClassName="w-full"
            textClassName="text-destructive"
          >
            <SettingsRow label="Log out" icon={{ family: "Feather", name: "log-out" }} destructive />
          </SignOutButton>
          <Pressable disabled accessibilityRole="button" accessibilityLabel="Delete account" accessibilityState={{ disabled: true }}>
            <SettingsRow label="Delete account" icon={{ family: "Feather", name: "trash-2" }} destructive last />
          </Pressable>
        </SettingsSection>
        <View className="items-center gap-1 pb-2">
          <HeadingText className="text-xl text-muted-foreground">Codaloud</HeadingText>
          <PText>{formatAppVersion(Constants.expoConfig?.version)}</PText>
        </View>
        {/* Temporary control for manually previewing the toast styling. */}
        <Button variant="outline" onPress={() => showSuccess("This is a test toast.")}>
          Activate Toast
        </Button>
      </View>
    </AppWrapper>
  );
};
