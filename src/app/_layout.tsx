import "../global.css";

import { fontAssets } from "@/lib/fonts";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontError) {
      console.error("Unable to load custom fonts", fontError);
    }

    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
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
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
};

export default RootLayout;
