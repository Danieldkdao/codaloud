import { agentTaskEventSchema } from "./schemas";
export const readTaskEvents = async function* (
  body: ReadableStream<Uint8Array>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const next = await reader.read();
      buffer += next.done
        ? decoder.decode()
        : decoder.decode(next.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        if (newline > 128000) throw new Error("Task update is too large.");
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield agentTaskEventSchema.parse(JSON.parse(line));
      }
      if (buffer.length > 128000) throw new Error("Task update is too large.");
      if (next.done) {
        if (buffer.trim()) throw new Error("Incomplete task update.");
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};
