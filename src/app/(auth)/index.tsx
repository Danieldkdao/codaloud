import { Image } from "@/components/ui/image";
import { HeadingText, PText } from "@/components/ui/text";
import { SocialSignInButtons } from "@/features/auth/components/social-sign-in-buttons";
import { Stack } from "expo-router";
import { View } from "react-native";

const Index = () => {
  return (
    <>
      <Stack.Screen
        options={{ title: "Welcome to Codaloud", headerShown: false }}
      />
      <View className="w-full max-w-md flex-1 self-center justify-center gap-6">
        <View className="shrink items-center gap-4">
          <Image
            source={{
              default: require("@/assets/logo.png"),
              dark: require("@/assets/logo-dark.png"),
            }}
            accessibilityLabel="Codaloud logo"
            accessible
            contentFit="contain"
            style={{ width: 160, height: 160, flexShrink: 1 }}
          />
          <View className="w-full shrink-0 items-center gap-3">
            <HeadingText
              accessibilityRole="header"
              className="text-center text-3xl"
            >
              Your voice. Your code.
            </HeadingText>
            <PText className="max-w-sm text-center text-xl">
              Build, edit, and explore code with your voice. Your next idea
              starts here, wherever you are.
            </PText>
          </View>
        </View>
        <View className="shrink-0 gap-3">
          <SocialSignInButtons />
          <PText className="text-center">
            Your projects and files stay on this device.
          </PText>
        </View>
      </View>
    </>
  );
};

export default Index;
