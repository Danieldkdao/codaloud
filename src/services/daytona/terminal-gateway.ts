import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import {
  checkedSandbox,
  sandboxWorkspaceRoot,
} from "@/features/terminal/server/sandbox";
import { verifyTerminalTicket } from "@/features/terminal/server/ticket";
import {
  chargeCredits,
  InsufficientCreditsError,
  readBillingStatus,
} from "@/features/billing/server/billing-service";
import { billingRequiredMessage } from "@/features/billing/client-error";
import { createProjectPty } from "./project-pty";
import { retainTerminalHeartbeat } from "./terminal-heartbeat";

class PaidAccessEndedError extends Error {}

const billingDenial = (error: unknown) => {
  if (error instanceof InsufficientCreditsError)
    return { reason: "credits", message: billingRequiredMessage };
  if (error instanceof PaidAccessEndedError)
    return {
      reason: "plan",
      message:
        "Your paid plan ended. Open Settings → Plan and credits to renew.",
    };
  return null;
};

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
  retainTerminalHeartbeat(ws);
  let closed = false;
  let inputQueue = Promise.resolve();
  let meterTimer: ReturnType<typeof setInterval> | undefined;
  const write = (type: string, data?: unknown) => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type, data }));
  };
  void (async () => {
    const sandbox = await checkedSandbox(
      owner.sandboxId,
      owner,
      async (started, previousVersion) => {
        const billing = await readBillingStatus(owner.userId);
        if (billing.tier === "free") throw new PaidAccessEndedError();
        const digest = createHash("sha256")
          .update(`${started.id}:${previousVersion}`)
          .digest("hex");
        await chargeCredits(
          owner.userId,
          `sandbox-start:${digest}`,
          2,
          "Sandbox start",
        );
      },
    );
    const root = await sandboxWorkspaceRoot(sandbox);
    if (closed) return;
    const decoder = new TextDecoder();
    const onData = (bytes: Uint8Array) =>
      write("data", decoder.decode(bytes, { stream: true }));
    const session = await createProjectPty(sandbox.process, root, onData);
    const pty = session.handle;
    if (closed) {
      await session.close();
      return;
    }
    const chargeActiveBlock = async () => {
      const billing = await readBillingStatus(owner.userId);
      if (billing.tier === "free") throw new PaidAccessEndedError();
      const block = Math.floor(Date.now() / 180_000);
      const digest = createHash("sha256")
        .update(`${sandbox.id}:${block}`)
        .digest("hex");
      await chargeCredits(
        owner.userId,
        `sandbox-active:${digest}`,
        1,
        "Sandbox compute · 3 minutes",
      );
    };
    try {
      await chargeActiveBlock();
    } catch (error) {
      await session.close();
      const denial = billingDenial(error);
      write(
        denial ? "billing" : "error",
        denial ?? "Terminal billing check failed. Please try again.",
      );
      ws.close(4003);
      return;
    }
    if (closed) {
      await session.close();
      return;
    }
    meterTimer = setInterval(() => {
      void chargeActiveBlock().catch((error) => {
        const denial = billingDenial(error);
        write(
          denial ? "billing" : "error",
          denial ?? "Terminal billing check failed. Please try again.",
        );
        ws.close(4003);
      });
    }, 180_000);
    write("ready", { sandboxId: sandbox.id, sessionId: session.id });
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
      clearInterval(meterTimer);
      void session
        .close()
        .then(async () => {
          if (!connections.has(key)) await sandbox.stop();
        })
        .catch(() => undefined);
    });
    void pty.wait().then(
      (result) => write("exit", result.exitCode),
      () => write("error", "The terminal session ended."),
    );
  })().catch((error) => {
    const denial = billingDenial(error);
    write(
      denial ? "billing" : "error",
      denial ?? "Unable to connect to the sandbox terminal.",
    );
    ws.close(denial ? 4003 : 1011);
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
