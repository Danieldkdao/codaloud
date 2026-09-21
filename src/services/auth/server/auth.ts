import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { serverEnv } from "@/data/env/server";
import { db } from "@/db/cloud/db";
import {
  AccountTable,
  SessionTable,
  UserTable,
  VerificationTable,
} from "@/db/cloud/schemas/auth";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    transaction: true,
    schema: {
      user: UserTable,
      session: SessionTable,
      account: AccountTable,
      verification: VerificationTable,
    },
  }),
  emailAndPassword: { enabled: false },
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
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
  },
  trustedOrigins: ["codaloud://"],
  plugins: [expo()],
});
