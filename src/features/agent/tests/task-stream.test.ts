import { expect, it } from "vitest";
import { readTaskEvents } from "../task-stream";
it("decodes split UTF-8 and multiple snapshots while ignoring heartbeats", async () => {
  const bytes = new TextEncoder().encode(
    "\n" +
      JSON.stringify({ id: "run_one", status: "running", logs: ["café"] }) +
      "\n" +
      JSON.stringify({
        id: "run_one",
        status: "completed",
        logs: [],
        summary: "Done",
      }) +
      "\n",
  );
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
      c.close();
    },
  });
  const result = [];
  for await (const event of readTaskEvents(stream)) result.push(event);
  expect(result.map((event) => event.status)).toEqual(["running", "completed"]);
  expect(result[0].logs).toEqual(["café"]);
});
it("rejects oversized or malformed frames", async () => {
  for (const value of ["x".repeat(128001), '{"status":"made-up"}\n']) {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(value));
        c.close();
      },
    });
    await expect(
      (async () => {
        for await (const _event of readTaskEvents(stream)) {
          /* consume */
        }
      })(),
    ).rejects.toThrow();
  }
});
