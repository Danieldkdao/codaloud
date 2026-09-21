import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/local/schema.ts",
  out: "./drizzle/local",
});
