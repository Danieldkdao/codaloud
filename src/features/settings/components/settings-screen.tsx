import { AppWrapper } from "@/components/app-wrapper";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import { GitHubConnection } from "@/services/github/components/github-connection";
import { GitIdentityForm } from "@/features/settings/components/git-identity-form";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import Constants from "expo-constants";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { formatAppVersion } from "../lib/formatters";
import { AppearanceSelector } from "./appearance-selector";
import { SettingsRow, SettingsSection } from "./settings-section";

export const SettingsScreen = () => {
  const [voiceHints, setVoiceHints] = useState(true);
  const [taskNotifications, setTaskNotifications] = useState(false);
  const primary = useThemeColor("primary");
  const border = useThemeColor("border");

  return (
    <AppWrapper tabBarShown>
      <View className="w-full max-w-xl gap-6 self-center">
        <HeadingText accessibilityRole="header" className="text-4xl">
          Settings
        </HeadingText>

        <SettingsSection title="Appearance">
          <AppearanceSelector />
        </SettingsSection>

        <SettingsSection title="Preferences">
          <SettingsRow
            label="Voice hints"
            icon={{ family: "Feather", name: "mic" }}
          >
            <Switch
              accessibilityLabel="Voice hints"
              value={voiceHints}
              onValueChange={setVoiceHints}
              trackColor={{ false: border, true: primary }}
              ios_backgroundColor={border}
            />
          </SettingsRow>
          <SettingsRow
            label="Task notifications"
            icon={{ family: "Feather", name: "bell" }}
            last
          >
            <Switch
              accessibilityLabel="Task notifications"
              value={taskNotifications}
              onValueChange={setTaskNotifications}
              trackColor={{ false: border, true: primary }}
              ios_backgroundColor={border}
            />
          </SettingsRow>
        </SettingsSection>

        <GitIdentityForm />

        <SettingsSection title="Connections">
          <View className="p-4">
            <GitHubConnection />
          </View>
        </SettingsSection>

        <SettingsSection title="Account">
          <SignOutButton />
        </SettingsSection>

        <SettingsSection title="About & legal">
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityLabel="Privacy policy"
            accessibilityState={{ disabled: true }}
          >
            <SettingsRow
              label="Privacy policy"
              icon={{ family: "Feather", name: "shield" }}
            >
              <Icon
                family="Feather"
                name="chevron-right"
                size={18}
                className="text-muted-foreground"
                accessible={false}
              />
            </SettingsRow>
          </Pressable>
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityLabel="Terms of service"
            accessibilityState={{ disabled: true }}
          >
            <SettingsRow
              label="Terms of service"
              icon={{ family: "Feather", name: "file-text" }}
              last
            >
              <Icon
                family="Feather"
                name="chevron-right"
                size={18}
                className="text-muted-foreground"
                accessible={false}
              />
            </SettingsRow>
          </Pressable>
        </SettingsSection>

        <View className="items-center gap-1 pb-2">
          <HeadingText className="text-xl text-muted-foreground">
            Codaloud
          </HeadingText>
          <PText>{formatAppVersion(Constants.expoConfig?.version)}</PText>
        </View>
      </View>
    </AppWrapper>
  );
};
