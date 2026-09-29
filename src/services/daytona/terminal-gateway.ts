import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import {
  checkedSandbox,
  sandboxWorkspaceRoot,
} from "@/features/terminal/server/sandbox";
import { verifyTerminalTicket } from "@/features/terminal/server/ticket";

const messageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("input"), data: z.string().max(65536) }),
  z.strictObject({
    type: z.literal("resize"),
    cols: z.number().int().min(20).max(240),
    rows: z.number().int().min(5).max(100),
  }),
  z.strictObject({
    type: z.literal("command"),
    id: z.uuid(),
    command: z.string().min(1).max(2000),
    timeout: z.number().int().min(1).max(120),
  }),
]);

const port = serverEnv.TERMINAL_PORT;

const server = createServer((request, response) => {
  response.writeHead(request.url === "/health" ? 200 : 404, {
    "Content-Type": "text/plain",
    "Cache-Control": "no-store",
  });
  response.end(request.url === "/health" ? "ready" : "not found");
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536 });
const connections = new Map<string, WebSocket>();
const tickets = new WeakMap<
  WebSocket,
  ReturnType<typeof verifyTerminalTicket>
>();

server.on("upgrade", (request, socket, head) => {
  try {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);
    if (url.pathname !== "/terminal") throw new Error("Unknown endpoint.");
    const ticket = verifyTerminalTicket(
      url.searchParams.get("ticket") ?? "",
      serverEnv.BETTER_AUTH_SECRET,
    );
    sockets.handleUpgrade(request, socket, head, (ws) => {
      tickets.set(ws, ticket);
      sockets.emit("connection", ws, request);
    });
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});

sockets.on("connection", (ws) => {
  const owner = tickets.get(ws);
  if (!owner) return ws.close(1008);
  const key = `${owner.userId}:${owner.deviceId}:${owner.projectId}`;
  connections.get(key)?.close(4000, "A newer terminal connection opened.");
  connections.set(key, ws);
  let closed = false;
  let inputQueue = Promise.resolve();
  const write = (type: string, data?: unknown) => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type, data }));
  };
  void (async () => {
    const sandbox = await checkedSandbox(owner.sandboxId, owner);
    const root = await sandboxWorkspaceRoot(sandbox);
    if (closed) return;
    const id = `codaloud-${owner.projectId}`;
    const decoder = new TextDecoder();
    const onData = (bytes: Uint8Array) =>
      write("data", decoder.decode(bytes, { stream: true }));
    let pty;
    try {
      pty = await sandbox.process.connectPty(id, { onData });
    } catch {
      pty = await sandbox.process.createPty({
        id,
        cwd: root,
        cols: 80,
        rows: 24,
        envs: { TERM: "xterm-256color", LANG: "C.UTF-8" },
        onData,
      });
    }
    if (closed) {
      await pty.disconnect();
      return;
    }
    write("ready", { sandboxId: sandbox.id, sessionId: id });
    ws.on("message", (raw) => {
      try {
        const input = messageSchema.parse(JSON.parse(raw.toString()));
        inputQueue = inputQueue
          .then(async () => {
            if (input.type === "input") await pty.sendInput(input.data);
            else if (input.type === "resize")
              await pty.resize(input.cols, input.rows);
            else {
              const result = await sandbox.process.executeCommand(
                input.command,
                root,
                undefined,
                input.timeout,
              );
              write(
                "data",
                "\r\n$ " +
                  input.command +
                  "\r\n" +
                  result.result.slice(0, 128000) +
                  "\r\n",
              );
              write("commandResult", {
                id: input.id,
                exitCode: result.exitCode,
                output: result.result.slice(0, 128000),
              });
            }
          })
          .catch(() =>
            write("error", "Terminal input could not be delivered."),
          );
      } catch {
        write("error", "Invalid terminal input.");
      }
    });
    ws.once("close", () => {
      void pty.disconnect();
    });
    void pty.wait().then(
      (result) => write("exit", result.exitCode),
      () => write("error", "The terminal session ended."),
    );
  })().catch(() => {
    write("error", "Unable to connect to the sandbox terminal.");
    ws.close(1011);
  });
  ws.once("close", () => {
    closed = true;
    if (connections.get(key) === ws) connections.delete(key);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.info(`[terminal] PTY gateway listening on ${port}`);
});
process.once("SIGTERM", () => {
  for (const connection of connections.values()) connection.close(1001);
  server.close();
});
