import "../global.css";

import { authClient } from "@/lib/auth/auth-client";
import { MODAL_SCREEN_OPTIONS } from "@/lib/constants";
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
          options={{
            ...MODAL_SCREEN_OPTIONS,
            presentation: "formSheet",
            sheetAllowedDetents: [0.65, 1],
            sheetInitialDetentIndex: 0,
            sheetGrabberVisible: true,
            sheetExpandsWhenScrolledToEdge: true,
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
};

export default RootLayout;
