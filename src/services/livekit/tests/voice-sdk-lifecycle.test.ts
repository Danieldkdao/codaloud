import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as esm from "livekit-client";

// Exercise the installed SDK and the same duplicate-listener detection used
// by native WebRTC, without loading a native module or opening a connection.
const require = createRequire(import.meta.url);
const shim = require(
  join(
    dirname(require.resolve("@livekit/react-native-webrtc/package.json")),
    "src/vendor/event-target-shim/index.js",
  ),
);
class MicrophoneTrack extends shim.EventTarget {
  id = crypto.randomUUID();
  kind = "audio";
  enabled = true;
  muted = false;
  readyState = "live";
  getConstraints = () => ({});
  getSettings = () => ({});
  stop = () => {
    this.readyState = "ended";
  };
}
const microphone = () => new MicrophoneTrack() as unknown as MediaStreamTrack;
const stream = (track: MediaStreamTrack) => ({ getTracks: () => [track] });
const connectedSignal = (Room: typeof esm.Room) => {
  const room = new Room({ disconnectOnPageLeave: false });
  const client = room.engine.client;
  client["sendLifecycleInput"]({ type: "connect" });
  client["sendLifecycleInput"]({
    type: "connectComplete",
    attemptId: client["attemptId"],
  });
  client["pingTimeoutDuration"] = 1;
  return client;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", {
    product: "ReactNative",
    mediaDevices: { getUserMedia: async () => stream(microphone()) },
  });
  vi.stubGlobal(
    "MediaStream",
    class {
      constructor(public tracks: MediaStreamTrack[]) {}
      getTracks() {
        return this.tracks;
      }
    },
  );
});
afterEach(() => {
  shim.setWarningHandler(undefined);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe.each([
  ["ESM", esm],
  ["CommonJS", require("livekit-client") as typeof esm],
] as const)(
  "LiveKit %s distribution",
  (_format, { LocalAudioTrack, RemoteAudioTrack, Room, TrackEvent }) => {
    it("does not register duplicate native listeners when a microphone restarts", async () => {
      const warning = vi.fn();
      shim.setWarningHandler(warning);
      const track = new LocalAudioTrack(microphone());
      await track.restartTrack();
      await track.restartTrack();
      const ended = vi.fn();
      track.on(TrackEvent.Ended, ended);
      track.mediaStreamTrack.dispatchEvent(new shim.Event("ended"));
      expect(ended).toHaveBeenCalledOnce();
      track.stop();
      expect(warning).not.toHaveBeenCalled();
    });

    it("does not report a signal read failure after an intentional close", async () => {
      const client = connectedSignal(Room);
      const error = vi
        .spyOn(client["log"], "error")
        .mockImplementation(() => {});
      let source!: ReadableStreamDefaultController<string>;
      const reader = new ReadableStream<string>({
        start(controller) {
          source = controller;
        },
      }).getReader();
      const reading = client.startReadingLoop(reader);
      await client.close();
      source.error(new Error("WS closed unexpectedly with code 1001"));
      await reading;
      expect(error).not.toHaveBeenCalled();
    });

    it("does not rearm ping timeouts for a signal message arriving after close", async () => {
      const client = connectedSignal(Room);
      const warning = vi
        .spyOn(client["log"], "warn")
        .mockImplementation(() => {});
      let source!: ReadableStreamDefaultController<string>;
      const reader = new ReadableStream<string>({
        start(controller) {
          source = controller;
        },
      }).getReader();
      const reading = client.startReadingLoop(reader);
      await client.close();
      source.enqueue(JSON.stringify({ pong: "1" }));
      source.close();
      await reading;
      await vi.advanceTimersByTimeAsync(2000);
      expect(warning).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("still reports an unexpected signal failure during an active session", async () => {
      const client = connectedSignal(Room);
      const error = vi
        .spyOn(client["log"], "error")
        .mockImplementation(() => {});
      const failure = new Error("WS closed unexpectedly with code 1001");
      const reader = new ReadableStream<string>({
        start(source) {
          source.error(failure);
        },
      }).getReader();
      await client.startReadingLoop(reader);
      expect(error).toHaveBeenCalledWith("error reading from signal stream", {
        error: failure,
      });
      expect(client.isDisconnected).toBe(true);
      await client.close();
    });

    it("does not rearm a ping timer when handling a leave closes the session", async () => {
      const client = connectedSignal(Room);
      let closing: Promise<void> | undefined;
      client.onLeave = () => {
        closing = client.close();
      };
      const reader = new ReadableStream<string>({
        start: (source) => {
          source.enqueue(
            JSON.stringify({ leave: { reason: "CLIENT_INITIATED" } }),
          );
          source.close();
        },
      }).getReader();
      await client.startReadingLoop(reader);
      await closing;
      expect(client.isDisconnected).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("ignores a failed old read loop after another connection takes ownership", async () => {
      const client = connectedSignal(Room);
      const error = vi
        .spyOn(client["log"], "error")
        .mockImplementation(() => {});
      let source!: ReadableStreamDefaultController<string>;
      const reader = new ReadableStream<string>({
        start: (controller) => {
          source = controller;
        },
      }).getReader();
      const reading = client.startReadingLoop(reader);
      await client.close();
      client["sendLifecycleInput"]({ type: "connect" });
      client["sendLifecycleInput"]({
        type: "connectComplete",
        attemptId: client["attemptId"],
      });
      source.error(new Error("Old socket closed"));
      await reading;
      expect(error).not.toHaveBeenCalled();
      expect(client.isDisconnected).toBe(false);
      await client.close();
    });

    it("does not request final native stats after track teardown", async () => {
      const getStats = vi.fn().mockResolvedValue(new Map());
      const local = new LocalAudioTrack(microphone());
      local.sender = {
        getStats,
        replaceTrack: vi.fn().mockResolvedValue(undefined),
      } as unknown as RTCRtpSender;
      const remote = new RemoteAudioTrack(microphone(), "remote", {
        getStats,
      } as unknown as RTCRtpReceiver);
      // Periodic/live stats must remain available for diagnosing actual failures.
      await local.getRTCStatsReport();
      await remote.getRTCStatsReport();
      getStats.mockClear();
      local.stop();
      remote.stop();
      await Promise.resolve();
      expect(getStats).not.toHaveBeenCalled();
    });
  },
);
