import "../global.css";

import { QueryProvider } from "@/components/query-provider";
import { AppThemeProvider, useTheme } from "@/hooks/use-theme";
import { SuccessFeedbackProvider } from "@/hooks/use-success-feedback";
import { useOnboarding } from "@/features/settings/hooks/use-onboarding";
import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { PText } from "@/components/ui/text";
import { MODAL_SCREEN_OPTIONS } from "@/lib/constants";
import { fontAssets } from "@/lib/fonts";
import { subscribeToQueryLifecycle } from "@/lib/query-lifecycle";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ProjectSearchOverlayProvider } from "@/features/projects/components/project-search-overlay";

SplashScreen.preventAutoHideAsync();

const RootNavigator = () => {
  const { isReady: isThemeReady } = useTheme();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { ready: isAppReady, hasCompletedOnboarding, error, retry } = useOnboarding();

  useEffect(subscribeToQueryLifecycle, []);

  useEffect(() => {
    if (fontError) {
      console.error("Unable to load custom fonts", fontError);
    }

    if ((fontsLoaded || fontError) && isAppReady && isThemeReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isAppReady, isThemeReady]);

  if ((!fontsLoaded && !fontError) || !isAppReady || !isThemeReady) {
    return null;
  }

  if (hasCompletedOnboarding === null) {
    return (
      <AppWrapper>
        <PText accessibilityLiveRegion="polite">{error}</PText>
        <Button onPress={() => void retry()}>Try again</Button>
      </AppWrapper>
    );
  }

  return (
    <QueryProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ProjectSearchOverlayProvider>
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
              <Stack.Protected guard={hasCompletedOnboarding}>
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
              <Stack.Protected guard={!hasCompletedOnboarding}>
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              </Stack.Protected>
              <Stack.Screen name="github-connect" options={{ headerShown: false }} />
            </Stack>
          </SuccessFeedbackProvider>
        </ProjectSearchOverlayProvider>
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
