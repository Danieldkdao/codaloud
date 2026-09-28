import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configure, tasks, runs, wait } from "@trigger.dev/sdk";

// Explicitly opt in: this creates a development cloud run and makes a model call.
// Device IDs and acknowledgements are synthetic; no device files or Git change.
if (!process.argv.includes("--cloud"))
  throw new Error(
    "Use node --env-file=.env scripts/diagnose-task-waitpoints.mjs --cloud",
  );
// Standalone CLI tooling cannot load the app's full typed server environment.
const secretKey = process.env.TRIGGER_SECRET_KEY;
if (!secretKey?.startsWith("tr_dev_"))
  throw new Error("Use a development Trigger.dev key for this diagnostic.");
configure({ secretKey });
const deviceFailure = process.argv.includes("--device-failure");
const revision = "a".repeat(64);
const run = await tasks.trigger(
  "workspace-task",
  {
    requestId: randomUUID(),
    projectId: randomUUID(),
    deviceId: randomUUID(),
    revision,
    userId: "diagnostic-waitpoint",
    instruction:
      "Inspect the project root folder and the Git status. Call listFiles and gitStatus together in your first response, then summarize both results. Do not edit files or perform any Git mutations.",
  },
  { maxAttempts: 1, ttl: "1m", tags: ["diagnostic-overlap"] },
);
console.log(JSON.stringify({ runId: run.id, deviceFailure }));
const handled = new Set();
const commands = [];
const terminal = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "EXPIRED",
  "TIMED_OUT",
]);
let finished = false;
try {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const current = await runs.retrieve(run.id);
    if (terminal.has(current.status)) {
      finished = true;
      assert.equal(
        current.status,
        deviceFailure ? "FAILED" : "COMPLETED",
        current.error?.message,
      );
      assert.equal(
        current.metadata?.command,
        undefined,
        "Pending command survived task completion",
      );
      assert.equal(commands.length, deviceFailure ? 1 : 2);
      if (!deviceFailure)
        assert.deepEqual([...commands].sort(), ["gitStatus", "listFiles"]);
      console.log(
        JSON.stringify({ passed: true, status: current.status, commands }),
      );
      break;
    }
    const command = current.metadata?.command;
    if (command && !handled.has(command.tokenId)) {
      assert.ok(
        ["listFiles", "gitStatus"].includes(command.name),
        "Unexpected tool; refusing to acknowledge it",
      );
      assert.equal(command.revision, revision);
      if (deviceFailure)
        assert.equal(
          commands.length,
          0,
          "Task continued after a failed action",
        );
      handled.add(command.tokenId);
      commands.push(command.name);
      await wait.completeToken(command.tokenId, {
        ok: !deviceFailure,
        text: deviceFailure
          ? "Diagnostic device failure. No action was performed."
          : command.name === "listFiles"
            ? "Diagnostic fixture: README.md"
            : "Diagnostic fixture: clean branch main",
        revision,
      });
      console.log(JSON.stringify({ acknowledged: command.name }));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(
    finished,
    "Task did not settle within 60 seconds after fixture acknowledgements",
  );
} finally {
  if (!finished) {
    await runs.cancel(run.id);
    console.log("Cancelled unfinished diagnostic run.");
  }
}
