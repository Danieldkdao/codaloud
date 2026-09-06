import "../global.css";

import { authClient } from "@/lib/auth/auth-client";
import { fontAssets } from "@/lib/fonts";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  useEffect(() => {
    if (fontError) {
      console.error("Unable to load custom fonts", fontError);
    }

    if ((fontsLoaded || fontError) && !isSessionPending) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isSessionPending]);

  if ((!fontsLoaded && !fontError) || isSessionPending) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerTitleStyle: {
          fontFamily: "Fraunces_400Regular",
          fontWeight: "400",
        },
        headerLargeTitleStyle: {
          fontFamily: "Fraunces_400Regular",
          fontWeight: "400",
        },
        headerBackTitleStyle: { fontFamily: "Outfit_400Regular" },
      }}
    >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
        <Stack.Screen
          name="new-project"
          options={{ presentation: "modal" }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
};

export default RootLayout;
