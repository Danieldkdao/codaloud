import { serverEnv } from "@/data/env/server";
import { db } from "@/db/db";
import * as schema from "@/db/schema";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { generateAppleClientSecret } from "./utils";

export const auth = betterAuth({
  appName: "Codaloud",
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    transaction: true,
  }),
  advanced: { database: { generateId: "uuid" } },
  trustedOrigins: [
    "codaloud://",
    "https://appleid.apple.com",
    ...(process.env.NODE_ENV === "development" ? ["exp://**"] : []),
  ],
  account: {
    encryptOAuthTokens: true,
    accountLinking: { enabled: true, disableImplicitLinking: true },
  },
  socialProviders: {
    github: {
      clientId: serverEnv.GITHUB_CLIENT_ID,
      clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
    },
    // todo: once we have apple credentials
    // apple: async () => ({
    //   clientId: serverEnv.APPLE_CLIENT_ID,
    //   clientSecret: await generateAppleClientSecret(
    //     serverEnv.APPLE_CLIENT_ID,
    //     serverEnv.APPLE_TEAM_ID,
    //     serverEnv.APPLE_KEY_ID,
    //     serverEnv.APPLE_PRIVATE_KEY,
    //   ),
    //   appBundleIdentifier: serverEnv.APPLE_APP_BUNDLE_IDENTIFIER,
    // }),
  },
  plugins: [expo()],
});

export type Auth = typeof auth;
export type User = Auth["$Infer"]["Session"]["user"];
export type Session = Auth["$Infer"]["Session"]["session"];
