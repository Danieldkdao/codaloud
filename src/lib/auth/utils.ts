import { clientEnv } from "@/data/env/client";
import Constants from "expo-constants";

export const getBaseURL = () => {
  if (clientEnv.EXPO_PUBLIC_BETTER_AUTH_URL) {
    return clientEnv.EXPO_PUBLIC_BETTER_AUTH_URL;
  }
  if (__DEV__ && Constants.expoConfig?.hostUri) {
    return `http://${Constants.expoConfig.hostUri}`;
  }
  throw new Error(
    "Set EXPO_PUBLIC_BETTER_AUTH_URL to the deployed API server URL.",
  );
};
