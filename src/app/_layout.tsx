import "../global.css";

import { QueryProvider } from "@/components/query-provider";
import { AppThemeProvider } from "@/components/app-theme-provider";
import { useTheme } from "@/hooks/use-theme";
import { SuccessFeedbackProvider } from "@/components/success-feedback-provider";
import { authClient } from "@/lib/auth/auth-client";
import { MODAL_SCREEN_OPTIONS } from "@/lib/constants";
import { fontAssets } from "@/lib/fonts";
import { subscribeToQueryLifecycle } from "@/lib/query-lifecycle";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

SplashScreen.preventAutoHideAsync();

const RootNavigator = () => {
  const { isReady: isThemeReady } = useTheme();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  useEffect(subscribeToQueryLifecycle, []);

  useEffect(() => {
    if (fontError) {
      console.error("Unable to load custom fonts", fontError);
    }

    if ((fontsLoaded || fontError) && !isSessionPending && isThemeReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isSessionPending, isThemeReady]);

  if ((!fontsLoaded && !fontError) || isSessionPending || !isThemeReady) {
    return null;
  }

  return (
    // Remount the cache on sign-out or account changes before rendering new screens.
    <QueryProvider key={session?.user.id ?? "anonymous"}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SuccessFeedbackProvider>
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
              <Stack.Screen name="projects/[projectId]" options={{ title: "Project" }} />
              <Stack.Screen
                name="new-project"
                options={{
                  ...MODAL_SCREEN_OPTIONS,
                  presentation: "formSheet",
                  sheetAllowedDetents: "fitToContents",
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: false,
                }}
              />
              <Stack.Screen
                name="edit-project"
                options={{
                  ...MODAL_SCREEN_OPTIONS,
                  presentation: "formSheet",
                  sheetAllowedDetents: "fitToContents",
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetExpandsWhenScrolledToEdge: false,
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={!session}>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
        </SuccessFeedbackProvider>
      </GestureHandlerRootView>
    </QueryProvider>
  );
};

const RootLayout = () => (
  <AppThemeProvider>
    <RootNavigator />
  </AppThemeProvider>
);

export default RootLayout;
