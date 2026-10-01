import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { serverEnv } from "../../data/env/server";
import { db } from "../../db/cloud/db";
import * as schema from "../../db/cloud/schema";
import { deleteRevenueCatCustomer } from "../../features/billing/delete-revenuecat-customer";
import { createAppleClientSecret } from "./apple-client-secret";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    transaction: true,
    schema: {
      ...schema,
      user: schema.UserTable,
      session: schema.SessionTable,
      account: schema.AccountTable,
      verification: schema.VerificationTable,
    },
  }),
  emailAndPassword: { enabled: false },
  advanced: {
    database: { generateId: "uuid" },
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        try {
          await deleteRevenueCatCustomer(user.id);
        } catch {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message:
              "Billing profile deletion is unavailable. Please try again later.",
          });
        }
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google", "apple"],
    },
  },
  socialProviders: {
    github: {
      clientId: serverEnv.GITHUB_CLIENT_ID,
      clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: serverEnv.GOOGLE_CLIENT_ID,
      clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
    },
    apple: async () => ({
      clientId: serverEnv.APPLE_CLIENT_ID,
      clientSecret: await createAppleClientSecret({
        clientId: serverEnv.APPLE_CLIENT_ID,
        teamId: serverEnv.APPLE_TEAM_ID,
        keyId: serverEnv.APPLE_KEY_ID,
        privateKey: serverEnv.APPLE_PRIVATE_KEY,
      }),
      appBundleIdentifier: serverEnv.APPLE_APP_BUNDLE_IDENTIFIER,
    }),
  },
  trustedOrigins: ["codaloud://", "https://appleid.apple.com"],
  plugins: [expo()],
});
