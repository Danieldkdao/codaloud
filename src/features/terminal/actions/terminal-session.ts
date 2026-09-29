import { randomUUID } from "expo-crypto";
import { z } from "zod";
import {
  appendTerminalCommand,
  appendTerminalOutput,
} from "../lib/terminal-output";
import { getTerminalDeviceId, terminalApi } from "./terminal-client";
import { syncProjectWorkspace, type SyncResult } from "./sync-workspace";

export type TerminalSnapshot = {
  status: "closed" | "connecting" | "ready" | "error";
  output: string;
  clearGeneration: number;
  error: string | null;
  syncGeneration: number;
  syncMessage: string | null;
  downloadedPaths: string[];
  deletedPaths: string[];
};
const messageSchema = z.object({
  type: z.string(),
  data: z.unknown().optional(),
});
type CommandResult = { exitCode: number; output: string };

export class ProjectTerminalSession {
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private rawListeners = new Set<(chunk: string) => void>();
  private rawOutput = "";
  private pendingRaw = "";
  private commands = new Map<
    string,
    { resolve: (value: CommandResult) => void; reject: (error: Error) => void }
  >();
  private panels = 0;
  private activeCommands = 0;
  private closeWhenIdle = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRun: {
    marker: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private snapshot: TerminalSnapshot = {
    status: "closed",
    output: "",
    clearGeneration: 0,
    error: null,
    syncGeneration: 0,
    syncMessage: null,
    downloadedPaths: [],
    deletedPaths: [],
  };
  constructor(readonly projectId: string) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  getRawOutput = () => this.rawOutput;
  subscribeRawOutput = (listener: (chunk: string) => void) => {
    this.rawListeners.add(listener);
    return () => {
      this.rawListeners.delete(listener);
    };
  };
  retainPanel() {
    this.panels++;
    this.closeWhenIdle = false;
    return () => {
      this.panels = Math.max(0, this.panels - 1);
      if (this.panels === 0) this.disconnect();
    };
  }
  private update(patch: Partial<TerminalSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private appendRawOutput(chunk: string) {
    if (!chunk) return;
    const next = this.rawOutput + chunk;
    if (next.length > 200_000) {
      const boundary = next.indexOf("\n", next.length - 200_000);
      this.rawOutput = next.slice(
        boundary >= 0 ? boundary + 1 : next.length - 200_000,
      );
    } else this.rawOutput = next;
    for (const listener of this.rawListeners) listener(chunk);
  }
  // A completion marker may span PTY chunks; keep its possible prefix out of
  // Ghostty until the next chunk confirms whether it is terminal output.
  private withoutRunMarker(chunk: string, marker?: string) {
    const buffered = this.pendingRaw + chunk;
    this.pendingRaw = "";
    if (!marker) return { visible: buffered, completed: false };
    const markerAt = buffered.indexOf(marker);
    if (markerAt >= 0)
      return {
        visible:
          buffered.slice(0, markerAt) +
          buffered.slice(markerAt + marker.length),
        completed: true,
      };
    let suffix = Math.min(marker.length - 1, buffered.length);
    while (suffix > 0 && !buffered.endsWith(marker.slice(0, suffix))) suffix--;
    this.pendingRaw = buffered.slice(buffered.length - suffix);
    return {
      visible: buffered.slice(0, buffered.length - suffix),
      completed: false,
    };
  }
  private flushPendingRaw() {
    this.appendRawOutput(this.pendingRaw);
    this.pendingRaw = "";
  }
  private scheduleSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      void this.sync().catch(() => {});
    }, 3500);
  }
  async sync() {
    const result = await syncProjectWorkspace(this.projectId);
    const problems = [...new Set([...result.conflicts, ...result.failures])];
    const visible = problems
      .slice(0, 3)
      .map((path) =>
        result.failureReasons?.[path]
          ? `${path} (${result.failureReasons[path]})`
          : path,
      );
    this.update({
      syncGeneration:
        this.snapshot.syncGeneration +
        (result.downloaded + result.localDeleted > 0 ? 1 : 0),
      downloadedPaths: result.downloadedPaths,
      deletedPaths: result.localDeletedPaths,
      syncMessage: problems.length
        ? String(problems.length) +
          " files need attention: " +
          visible.join(", ") +
          (problems.length > 3 ? `, and ${problems.length - 3} more` : "")
        : "Synced " +
          String(result.uploaded + result.downloaded + result.deleted) +
          " file changes.",
    });
    return result;
  }
  connect(prepared?: SyncResult) {
    if (this.connecting) return this.connecting;
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    this.update({ status: "connecting", error: null });
    this.connecting = (async () => {
      const synced = prepared ?? (await this.sync());
      const deviceId = await getTerminalDeviceId();
      const { ticket, url } = await terminalApi.ticket(
        this.projectId,
        deviceId,
        synced.sandboxId,
      );
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(
          url + "?ticket=" + encodeURIComponent(ticket),
        );
        this.socket = socket;
        socket.onmessage = (event) => {
          try {
            const message = messageSchema.parse(JSON.parse(String(event.data)));
            if (message.type === "ready") {
              this.update({ status: "ready" });
              resolve();
            } else if (
              message.type === "data" &&
              typeof message.data === "string"
            ) {
              const pending = this.pendingRun;
              const raw = this.withoutRunMarker(message.data, pending?.marker);
              this.appendRawOutput(raw.visible);
              const output = appendTerminalOutput(
                this.snapshot.output,
                message.data,
              );
              const markerAt = pending ? output.indexOf(pending.marker) : -1;
              this.update({
                output:
                  markerAt >= 0 && pending
                    ? output.replace(pending.marker, "")
                    : output,
              });
              if (raw.completed && pending) {
                this.pendingRun = null;
                clearTimeout(pending.timer);
                pending.resolve();
              }
              this.scheduleSync();
            } else if (message.type === "commandResult") {
              const result = z
                .object({
                  id: z.uuid(),
                  exitCode: z.number(),
                  output: z.string(),
                })
                .parse(message.data);
              this.commands
                .get(result.id)
                ?.resolve({ exitCode: result.exitCode, output: result.output });
              this.commands.delete(result.id);
              this.scheduleSync();
            } else if (message.type === "error") {
              this.update({
                status: "error",
                error: String(message.data ?? "Terminal error."),
              });
              reject(new Error(String(message.data ?? "Terminal error.")));
            }
          } catch {
            this.update({
              status: "error",
              error: "Invalid terminal response.",
            });
          }
        };
        socket.onerror = () =>
          reject(new Error("Unable to reach the terminal gateway."));
        socket.onclose = () => {
          if (this.pendingRun) {
            this.flushPendingRaw();
            const pending = this.pendingRun;
            this.pendingRun = null;
            clearTimeout(pending.timer);
            pending.reject(new Error("Terminal disconnected."));
          }
          if (this.socket === socket) this.socket = null;
          if (this.snapshot.status !== "error")
            this.update({ status: "closed" });
          for (const command of this.commands.values())
            command.reject(new Error("Terminal disconnected."));
          this.commands.clear();
          reject(new Error("Terminal disconnected."));
        };
      });
    })()
      .catch((error: unknown) => {
        this.update({
          status: "error",
          error:
            error instanceof Error ? error.message : "Terminal unavailable.",
        });
        throw error;
      })
      .finally(() => {
        this.connecting = null;
        if (
          this.closeWhenIdle &&
          this.panels === 0 &&
          this.activeCommands === 0
        )
          this.disconnect();
      });
    return this.connecting;
  }
  async sendInput(
    data: string,
    prepared?: SyncResult,
    visibleCommand?: string,
  ) {
    await this.connect(prepared);
    this.socket?.send(JSON.stringify({ type: "input", data }));
    if (visibleCommand)
      this.update({
        output: appendTerminalCommand(this.snapshot.output, visibleCommand),
      });
  }
  private clearRun(marker: string) {
    const pending = this.pendingRun;
    if (pending?.marker !== marker) return;
    clearTimeout(pending.timer);
    this.pendingRun = null;
    this.flushPendingRaw();
  }
  async runInPty(command: string, prepared?: SyncResult) {
    if (this.pendingRun) throw new Error("A file is already running.");
    await this.connect(prepared);
    const id = randomUUID();
    const marker = `__CODALOUD_DONE_${id}__`;
    const completed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          if (this.pendingRun?.marker !== marker) return;
          this.pendingRun = null;
          this.flushPendingRaw();
          reject(
            new Error("Run timed out. Interrupt the process to try again."),
          );
        },
        10 * 60 * 1000,
      );
      this.pendingRun = { marker, resolve, reject, timer };
    });
    try {
      // Split the marker in the echoed command so only the actual completion
      // output, after the program exits, can finish this run.
      await this.sendInput(
        `${command.trimEnd()}; printf '\\n%s%s\\n' '__CODALOUD_' 'DONE_${id}__'\n`,
        prepared,
        command.trimEnd(),
      );
      await completed;
    } catch (error) {
      this.clearRun(marker);
      throw error;
    }
  }
  async cancelRun() {
    const pending = this.pendingRun;
    if (!pending) return;
    this.pendingRun = null;
    clearTimeout(pending.timer);
    this.flushPendingRaw();
    pending.resolve();
    await this.sendInput("\u0003");
  }
  async resize(cols: number, rows: number) {
    await this.connect();
    this.socket?.send(JSON.stringify({ type: "resize", cols, rows }));
  }
  async runCommand(command: string, timeout = 60, prepared?: SyncResult) {
    this.activeCommands++;
    try {
      await this.connect(prepared);
      const id = randomUUID();
      return await new Promise<CommandResult>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            this.commands.delete(id);
            reject(new Error("Command timed out."));
          },
          (timeout + 10) * 1000,
        );
        this.commands.set(id, {
          resolve: (result) => {
            clearTimeout(timer);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        this.socket?.send(
          JSON.stringify({ type: "command", id, command, timeout }),
        );
      });
    } finally {
      this.activeCommands--;
      if (this.closeWhenIdle && this.panels === 0 && this.activeCommands === 0)
        this.disconnect();
    }
  }
  disconnect() {
    if (this.panels > 0) return;
    if (this.activeCommands > 0 || this.connecting) {
      this.closeWhenIdle = true;
      return;
    }
    this.closeWhenIdle = false;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    this.socket?.close();
    this.socket = null;
    this.update({ status: "closed" });
  }
  clear() {
    this.rawOutput = "";
    this.update({
      output: "",
      clearGeneration: this.snapshot.clearGeneration + 1,
    });
  }
}

const sessions = new Map<string, ProjectTerminalSession>();
export const projectTerminalSession = (projectId: string) => {
  let session = sessions.get(projectId);
  if (!session) {
    session = new ProjectTerminalSession(projectId);
    sessions.set(projectId, session);
  }
  return session;
};
