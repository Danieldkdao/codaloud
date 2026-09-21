import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const clientEnv = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_BETTER_AUTH_URL: z.url(),
  },
  emptyStringAsUndefined: true,
  runtimeEnv: {
    EXPO_PUBLIC_BETTER_AUTH_URL: process.env.EXPO_PUBLIC_BETTER_AUTH_URL,
  },
});
