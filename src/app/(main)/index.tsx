import { SignOutButton } from "@/components/auth/sign-out-button";
import { HeadingText } from "@/components/ui/text";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Stack } from "expo-router";
import { View } from "react-native";

const HomeScreen = () => {
  const { data: session } = useAuthSession();

  return (
    <>
      <Stack.Screen options={{ title: "Home" }} />
      <View className="w-full max-w-md flex-1 self-center justify-center gap-6">
        <HeadingText
          accessibilityRole="header"
          className="text-center text-3xl text-foreground"
        >
          Hi, {session?.user.name?.trim() || "there"}
        </HeadingText>
        <SignOutButton size="lg" accessibilityLabel="Sign out">
          Sign out
        </SignOutButton>
      </View>
    </>
  );
};

export default HomeScreen;
