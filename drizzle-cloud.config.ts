import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run cloud database commands.");
}

// Drizzle Kit runs outside the Expo application, so it cannot use the app's
// server environment module and reads the same validated variable directly.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/cloud/schema.ts",
  out: "./drizzle/cloud",
  dbCredentials: { url: databaseUrl },
});
