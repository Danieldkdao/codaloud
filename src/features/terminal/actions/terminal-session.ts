import { randomUUID } from "expo-crypto";
import { z } from "zod";
import {
  appendTerminalCommand,
  appendTerminalOutput,
} from "../lib/terminal-output";
import {
  getTerminalDeviceId,
  TerminalAccessError,
  terminalApi,
  type TerminalAccessRequirement,
} from "./terminal-client";
import {
  ensureProjectSandbox,
  syncProjectWorkspace,
  type SyncResult,
} from "./sync-workspace";
import { subscribeWorkspaceChanges } from "@/services/local-workspace/change-events";
import type { WorkspaceManifest } from "../lib/sync-plan";

export type TerminalSnapshot = {
  status: "closed" | "connecting" | "ready" | "blocked" | "error";
  access: TerminalAccessRequirement | null;
  output: string;
  clearGeneration: number;
  error: string | null;
  syncGeneration: number;
  syncMessage: string | null;
  syncing: boolean;
  downloadedPaths: string[];
  deletedPaths: string[];
};
const messageSchema = z.object({
  type: z.string(),
  data: z.unknown().optional(),
});
type CommandResult = { exitCode: number; output: string };
const manifestsMatch = (left: WorkspaceManifest, right: WorkspaceManifest) => {
  const paths = Object.keys(left);
  return (
    paths.length === Object.keys(right).length &&
    paths.every((path) => left[path] === right[path])
  );
};

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
  private localSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteCheckInFlight: Promise<void> | null = null;
  private remoteMaybeChanged = false;
  private remoteChangeVersion = 0;
  private remoteManifest: WorkspaceManifest | null = null;
  private remoteSandboxId: string | null = null;
  private allowedPaths: readonly string[] = [];
  private releaseWorkspaceChanges: (() => void) | null = null;
  private syncInFlight: Promise<SyncResult> | null = null;
  private inputQueue = Promise.resolve();
  private pendingRun: {
    marker: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private snapshot: TerminalSnapshot = {
    status: "closed",
    access: null,
    output: "",
    clearGeneration: 0,
    error: null,
    syncGeneration: 0,
    syncMessage: null,
    syncing: false,
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
    if (this.panels === 0 && (this.snapshot.access || this.snapshot.error))
      this.update({ status: "closed", access: null, error: null });
    if (this.panels === 0)
      this.releaseWorkspaceChanges = subscribeWorkspaceChanges(
        this.projectId,
        () => this.scheduleLocalChangeSync(),
      );
    this.panels++;
    this.closeWhenIdle = false;
    return () => {
      this.panels = Math.max(0, this.panels - 1);
      if (this.panels === 0) {
        this.releaseWorkspaceChanges?.();
        this.releaseWorkspaceChanges = null;
        this.disconnect();
      }
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
  private failPending(error: Error) {
    if (this.pendingRun) {
      this.flushPendingRaw();
      const pending = this.pendingRun;
      this.pendingRun = null;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    for (const command of this.commands.values()) command.reject(error);
    this.commands.clear();
  }
  private scheduleRemoteCheck() {
    if (!this.remoteMaybeChanged) return;
    if (this.remoteCheckTimer) clearTimeout(this.remoteCheckTimer);
    this.remoteCheckTimer = setTimeout(() => {
      this.remoteCheckTimer = null;
      void this.checkRemoteChanges().catch(() => {});
    }, 3500);
  }
  private checkRemoteChanges(): Promise<void> {
    if (this.remoteCheckInFlight) return this.remoteCheckInFlight;
    const check = (async () => {
      const checkedVersion = this.remoteChangeVersion;
      const sandboxId = this.remoteSandboxId;
      const baseline = this.remoteManifest;
      if (!sandboxId || !baseline) {
        await this.sync();
      } else {
        const deviceId = await getTerminalDeviceId();
        const current = await terminalApi.manifest(
          this.projectId,
          deviceId,
          sandboxId,
          this.allowedPaths,
          baseline,
        );
        if (!manifestsMatch(current, baseline)) await this.sync();
      }
      // A Run command may still write later; its completion marker checks again.
      this.remoteMaybeChanged =
        this.pendingRun !== null || this.remoteChangeVersion !== checkedVersion;
      if (this.remoteChangeVersion !== checkedVersion)
        this.scheduleRemoteCheck();
    })();
    this.remoteCheckInFlight = check.finally(() => {
      this.remoteCheckInFlight = null;
    });
    return this.remoteCheckInFlight;
  }
  private scheduleLocalChangeSync() {
    if (this.snapshot.status !== "ready") return;
    this.update({
      syncing: true,
      syncMessage: "Device files changed. Syncing them to the terminal…",
    });
    if (this.localSyncTimer) clearTimeout(this.localSyncTimer);
    this.localSyncTimer = setTimeout(() => {
      this.localSyncTimer = null;
      const previous = this.syncInFlight;
      if (previous)
        void previous
          .then(
            () => this.sync(),
            () => this.sync(),
          )
          .catch(() => {});
      else void this.sync().catch(() => {});
    }, 600);
  }
  sync(): Promise<SyncResult> {
    if (this.syncInFlight) return this.syncInFlight;
    this.update({ syncing: true, syncMessage: "Syncing project files…" });
    const run = (async () => {
      try {
        let lastProgressAt = 0;
        let lastPhase = "";
        const result = await syncProjectWorkspace(
          this.projectId,
          (syncMessage) => {
            const phase = syncMessage.split(" ")[0];
            if (phase === lastPhase && Date.now() - lastProgressAt < 100)
              return;
            lastProgressAt = Date.now();
            lastPhase = phase;
            this.update({ syncMessage });
          },
        );
        this.remoteSandboxId = result.sandboxId;
        this.remoteManifest = result.remoteManifest;
        this.allowedPaths = result.allowedPaths;
        // The server has accepted this project under the current billing state.
        // Clear an older plan/credit denial so an approved agent command can connect.
        const accessRestored = this.snapshot.status === "blocked";
        const problems = [
          ...new Set([...result.conflicts, ...result.failures]),
        ];
        const visible = problems
          .slice(0, 3)
          .map((path) =>
            result.failureReasons?.[path]
              ? `${path} (${result.failureReasons[path]})`
              : path,
          );
        this.update({
          ...(accessRestored
            ? { status: "closed" as const, access: null, error: null }
            : {}),
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
            : result.uploaded + result.downloaded + result.deleted > 0
              ? [
                  result.uploaded
                    ? `Uploaded ${result.uploaded}${result.uploadedPaths?.length ? `: ${result.uploadedPaths.slice(0, 2).join(", ")}` : ""}`
                    : "",
                  result.downloaded
                    ? `Downloaded ${result.downloaded}${result.downloadedPaths.length ? `: ${result.downloadedPaths.slice(0, 2).join(", ")}` : ""}`
                    : "",
                  result.deleted ? `Removed ${result.deleted}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") + "."
              : "All project files are up to date.",
          syncing: false,
        });
        return result;
      } catch (error) {
        this.update({
          syncing: false,
          syncMessage:
            error instanceof Error
              ? `Sync failed: ${error.message}`
              : "Sync failed. Try again.",
        });
        throw error;
      }
    })();
    this.syncInFlight = run.finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }
  connect(prepared?: SyncResult) {
    if (this.connecting) return this.connecting;
    if (this.snapshot.status === "blocked" || this.snapshot.status === "error")
      return Promise.reject(
        new Error(this.snapshot.error ?? "Terminal unavailable."),
      );
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    this.update({ status: "connecting", access: null, error: null });
    this.connecting = (async () => {
      const sandboxId =
        prepared?.sandboxId ?? (await ensureProjectSandbox(this.projectId));
      this.remoteSandboxId = sandboxId;
      const deviceId = await getTerminalDeviceId();
      const { ticket, url } = await terminalApi.ticket(
        this.projectId,
        deviceId,
        sandboxId,
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
              this.update({ status: "ready", access: null, error: null });
              if (!prepared) void this.sync().catch(() => {});
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
                this.remoteMaybeChanged = true;
                this.remoteChangeVersion++;
              }
              this.scheduleRemoteCheck();
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
              this.remoteMaybeChanged = true;
              this.remoteChangeVersion++;
              this.scheduleRemoteCheck();
            } else if (message.type === "billing") {
              const denial = z
                .object({
                  reason: z.enum(["plan", "credits"]),
                  message: z.string().min(1).max(500),
                })
                .parse(message.data);
              this.update({
                status: "blocked",
                access: denial.reason,
                error: denial.message,
              });
              reject(new TerminalAccessError(denial.message, denial.reason));
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
          if (this.socket && this.socket !== socket) return;
          this.failPending(new Error("Terminal disconnected."));
          if (this.socket === socket) this.socket = null;
          if (
            this.snapshot.status !== "error" &&
            this.snapshot.status !== "blocked"
          )
            this.update({ status: "closed" });
          reject(new Error("Terminal disconnected."));
        };
      });
    })()
      .catch((error: unknown) => {
        this.update({
          status: error instanceof TerminalAccessError ? "blocked" : "error",
          access:
            error instanceof TerminalAccessError ? error.requirement : null,
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
  retry() {
    this.failPending(new Error("Terminal disconnected."));
    const previousSocket = this.socket;
    this.socket = null;
    previousSocket?.close();
    this.update({ status: "closed", access: null, error: null });
    return this.connect();
  }
  sendInput(data: string, prepared?: SyncResult, visibleCommand?: string) {
    const write = this.inputQueue.then(async () => {
      await this.connect(prepared);
      this.socket?.send(JSON.stringify({ type: "input", data }));
      if (data.includes("\n")) {
        this.remoteMaybeChanged = true;
        this.remoteChangeVersion++;
        this.scheduleRemoteCheck();
      }
      if (visibleCommand)
        this.update({
          output: appendTerminalCommand(this.snapshot.output, visibleCommand),
        });
    });
    this.inputQueue = write.then(
      () => {},
      () => {},
    );
    return write;
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
    const hasPendingSync =
      this.localSyncTimer !== null || this.remoteCheckTimer !== null;
    if (this.localSyncTimer) clearTimeout(this.localSyncTimer);
    if (this.remoteCheckTimer) clearTimeout(this.remoteCheckTimer);
    this.localSyncTimer = null;
    this.remoteCheckTimer = null;
    this.socket?.close();
    this.socket = null;
    this.update({ status: "closed" });
    if (hasPendingSync) void this.sync().catch(() => {});
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
