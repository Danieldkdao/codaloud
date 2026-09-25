import type { VoiceMode } from "./schemas";
import type { ConnectVoice, VoiceConnection, VoiceState } from "./types";

export const createVoiceController = (
  connect: ConnectVoice,
  beforeStart?: () => Promise<unknown>,
  onStop?: () => void,
) => {
  let state: VoiceState = {
    connection: "idle",
    mode: null,
    listening: false,
    agentState: "listening",
    transcript: [],
    error: null,
  };
  const listeners = new Set<() => void>();
  let generation = 0;
  let lifetime: AbortController | undefined;
  let connection: VoiceConnection | undefined;
  let operations = Promise.resolve();
  let closing = Promise.resolve();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const clearIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  };
  const update = (patch: Partial<VoiceState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const stop = async () => {
    clearIdle();
    generation++;
    lifetime?.abort();
    lifetime = undefined;
    const previous = connection;
    connection = undefined;
    update({
      connection: "idle",
      mode: null,
      listening: false,
      error: null,
      transcriptWarning: undefined,
    });
    onStop?.();
    if (previous) closing = previous.close().catch(() => {});
    await closing;
  };
  const fail = async (message: string, current: number) => {
    if (generation !== current) return;
    await stop();
    if (generation === current + 1)
      update({ connection: "error", error: message });
  };
  const start = async (mode: VoiceMode) => {
    if (state.connection === "connecting" || state.listening) return;
    clearIdle();
    const current = ++generation;
    update({
      connection: "connecting",
      mode,
      listening: false,
      error: null,
      transcriptWarning: undefined,
    });
    try {
      if (beforeStart) {
        if (!connection) update({ connection: "connecting" });
        await beforeStart();
        if (current !== generation) return;
      }
      if (!connection) {
        lifetime = new AbortController();
        const signal = lifetime.signal;
        update({
          connection: "connecting",
          transcript: [],
          agentState: "listening",
        });
        await closing;
        if (current !== generation) return;
        const created = await connect(mode, signal, {
          // The lifetime, rather than the turn number, guards events between held turns.
          onSegment: (segment) => {
            if (signal.aborted) return;
            const transcript = [...state.transcript];
            const index = transcript.findIndex(
              (item) => item.id === segment.id,
            );
            if (index < 0) transcript.push(segment);
            else transcript[index] = segment;
            update({ transcript: transcript.slice(-60) });
          },
          onAgentState: (agentState) => {
            if (!signal.aborted) update({ agentState });
          },
          onError: (message) => {
            if (!signal.aborted) void fail(message, generation);
          },
          onTranscriptWarning: (message) => {
            if (!signal.aborted) update({ transcriptWarning: message });
          },
        });
        if (current !== generation) {
          await created.close();
          return;
        }
        connection = created;
      }
      const active = connection;
      operations = operations.then(async () => {
        if (current !== generation) return;
        await active.control(mode === "hold" ? "start" : "hands-free");
        if (current === generation)
          update({ connection: "connected", listening: true });
      });
      await operations;
    } catch (error) {
      operations = Promise.resolve();
      await fail(
        error instanceof Error
          ? error.message
          : "Voice could not connect. Try again.",
        current,
      );
    }
  };
  const release = async (cancel = false) => {
    if (state.mode !== "hold") return;
    if (state.connection === "connecting") {
      await stop();
      return;
    }
    // A pending start also needs a release, so queue behind the microphone publication.
    const active = connection;
    if (!active) return;
    const current = generation;
    const wasListening = state.listening;
    update({ listening: false });
    operations = operations.then(async () => {
      if (current !== generation || (!wasListening && !state.listening)) return;
      update({ listening: false });
      await active.control(cancel ? "cancel" : "commit");
    });
    try {
      await operations;
    } catch {
      operations = Promise.resolve();
      await fail("Voice connection was interrupted. Try again.", current);
    }
  };
  const pause = async (cancel = false) => {
    if (state.connection === "connecting") {
      await stop();
      return;
    }
    const active = connection;
    if (!active) return;
    const current = generation;
    update({ mode: null, listening: false });
    operations = operations.then(async () => {
      if (current !== generation) return;
      await active.control(cancel ? "cancel" : "stop");
      if (current === generation) update({ listening: false });
    });
    try {
      await operations;
    } catch {
      operations = Promise.resolve();
      await fail("Voice connection was interrupted. Try again.", current);
    }
  };
  const park = async () => {
    clearIdle();
    const current = generation;
    await pause(true);
    if (current !== generation || state.connection !== "connected") return;
    update({ transcript: [], error: null, transcriptWarning: undefined });
    // Closing inline controls ends capture and the turn immediately. Retain
    // only the muted transport briefly so another tap avoids room/auth setup.
    idleTimer = setTimeout(() => void stop(), 60_000);
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    release,
    // The native suggestion receiver already muted capture. Keep controller
    // state in sync so the next spoken correction can reuse this connection.
    captureEnded: () => update({ listening: false, mode: null }),
    pause,
    park,
    stop,
  };
};
