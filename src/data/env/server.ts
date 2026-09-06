import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.url().min(1),
    BETTER_AUTH_URL: z.url().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    APPLE_CLIENT_ID: z.string().min(1),
    APPLE_TEAM_ID: z.string().min(1),
    APPLE_KEY_ID: z.string().min(1),
    APPLE_PRIVATE_KEY: z.string().min(1),
    APPLE_APP_BUNDLE_IDENTIFIER: z.string().min(1),
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
});
