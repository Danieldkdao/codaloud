import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { getBaseURL } from "./utils";

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [
    expoClient({
      scheme: "codaloud",
      storagePrefix: "codaloud",
      storage: SecureStore,
    }),
  ],
});
