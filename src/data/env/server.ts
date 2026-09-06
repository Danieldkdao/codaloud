import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.url().min(1),
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
});
