import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve("@trigger.dev/sdk"));
const core = resolve(
  dirname(sdkRequire.resolve("@trigger.dev/core/v3")),
  "../..",
);

// A subprocess is intentional: an uncaught SDK microtask kills Expo, even when
// the route catches iterator errors. Testing only a mocked subscription misses it.
describe.each(["esm", "commonjs"])("Trigger stream lifecycle: %s", (format) => {
  it.each([
    "completed",
    "pending",
    "cancelled",
    "errored",
    "already-aborted",
    "transforming",
  ])(
    "survives %s cleanup without leaking its reader or abort listener",
    (scenario) => {
      const moduleUrl = pathToFileURL(
        resolve(core, format, "v3/streams/asyncIterableStream.js"),
      ).href;
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
        import assert from "node:assert/strict";
        import { getEventListeners } from "node:events";
        import { createAsyncIterableReadable } from ${JSON.stringify(moduleUrl)};
        const scenario = ${JSON.stringify(scenario)};
        const abort = new AbortController();
        let cancelled = 0;
        let sourceController;
        const source = new ReadableStream({
          start(controller) { sourceController = controller; },
          cancel() { cancelled++; },
        });
        if (scenario === "already-aborted") abort.abort();
        let started;
        let finish;
        const transforming = new Promise(resolve => { started = resolve; });
        const pending = new Promise(resolve => { finish = resolve; });
        const transformer = scenario === "transforming" ? {
          async transform(value, controller) {
            started();
            await pending;
            controller.enqueue(value);
          }
        } : {};
        const stream = createAsyncIterableReadable(source, transformer, abort.signal);
        const reader = stream.getReader();
        const read = reader.read();
        if (scenario === "completed") {
          sourceController.enqueue("update");
          assert.deepEqual(await read, { value: "update", done: false });
          sourceController.close();
          assert.deepEqual(await reader.read(), { value: undefined, done: true });
        }
        if (scenario === "pending") abort.abort();
        if (scenario === "cancelled") await reader.cancel();
        if (scenario === "transforming") {
          sourceController.enqueue("late update");
          await transforming;
          abort.abort();
          finish();
        }
        if (scenario === "errored") {
          sourceController.error(new Error("upstream failed"));
          await assert.rejects(read, /upstream failed/);
        } else if (scenario !== "completed") {
          assert.deepEqual(await read, { value: undefined, done: true });
        }
        abort.abort();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(getEventListeners(abort.signal, "abort").length, 0);
        assert.equal(source.locked, false);
        if (["pending", "cancelled", "already-aborted", "transforming"].includes(scenario)) assert.equal(cancelled, 1);
        console.log("clean shutdown");
      `,
        ],
        { encoding: "utf8", timeout: 3000 },
      );
      expect(result.status, result.stderr || String(result.error)).toBe(0);
      expect(result.stdout).toContain("clean shutdown");
    },
  );
});
