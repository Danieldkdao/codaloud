import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { clientEnv } from "@/data/env/client";

export const authClient = createAuthClient({
  baseURL: clientEnv.EXPO_PUBLIC_BETTER_AUTH_URL,
  plugins: [
    expoClient({
      scheme: "codaloud",
      storagePrefix: "codaloud",
      storage: SecureStore,
    }),
  ],
});
