import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const clientEnv = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_BETTER_AUTH_URL: z.url().optional(),
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: z.string().min(1),
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: z.string().min(1),
  },
  emptyStringAsUndefined: true,
  runtimeEnv: {
    EXPO_PUBLIC_BETTER_AUTH_URL: process.env.EXPO_PUBLIC_BETTER_AUTH_URL,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  },
});
