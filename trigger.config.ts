import { defineConfig } from "@trigger.dev/sdk";
import "dotenv/config";

// The CLI loads this before application modules; it cannot load the app's full
// server env schema. The non-secret project ref is a deployment configuration.
const project = process.env.TRIGGER_PROJECT_REF;
if (!project?.startsWith("proj_"))
  throw new Error(
    "Set TRIGGER_PROJECT_REF to your Trigger.dev dashboard project ref.",
  );
export default defineConfig({
  project,
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 600,
  retries: { enabledInDev: true, default: { maxAttempts: 1 } },
});
