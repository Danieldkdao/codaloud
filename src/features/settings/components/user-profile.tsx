import { Icon } from "@/components/ui/icon";
import { Image } from "@/components/ui/image";
import { HeadingText, PText } from "@/components/ui/text";
import { View } from "react-native";
import { SettingsSection } from "./settings-section";

type UserProfileProps = {
  name: string;
  email: string;
  image?: string | null;
};

export const UserProfile = ({ name, email, image }: UserProfileProps) => (
  <SettingsSection title="Profile">
    <View className="flex-row items-center gap-4 p-4">
      {image ? (
        <Image
          source={{ default: { uri: image } }}
          accessibilityLabel={`${name}'s profile picture`}
          className="bg-muted"
          contentFit="cover"
          style={{ width: 52, height: 52, borderRadius: 32 }}
          transition={150}
        />
      ) : (
        <View className="size-16 items-center justify-center rounded-full bg-secondary">
          <Icon
            family="Feather"
            name="user"
            size={28}
            className="text-secondary-foreground"
            accessible={false}
          />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <HeadingText className="text-2xl font-medium" numberOfLines={1}>
          {name}
        </HeadingText>
        <PText numberOfLines={1} className="text-lg">
          {email}
        </PText>
      </View>
    </View>
  </SettingsSection>
);
