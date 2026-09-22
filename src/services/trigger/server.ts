import { configure } from "@trigger.dev/sdk";
import { serverEnv } from "@/data/env/server";
configure({ secretKey: serverEnv.TRIGGER_SECRET_KEY });
export { tasks, runs, wait, idempotencyKeys } from "@trigger.dev/sdk";
