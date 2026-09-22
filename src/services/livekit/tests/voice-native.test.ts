import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectNativeVoice } from "../voice-native";
import { createVoiceController } from "@/features/voice/voice-controller";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  trackStop: vi.fn(),
  startAudio: vi.fn(),
  stopAudio: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  microphone: vi.fn(),
  rpc: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  order: [] as string[],
  agentReady: true,
  agentError: "",
  listeners: new Map<string, Set<(...args: any[]) => void>>(),
  transcription: undefined as
    undefined | ((reader: any, participant: { identity: string }) => void),
}));
vi.mock("@livekit/react-native", () => ({
  registerGlobals: vi.fn(),
  AudioSession: {
    startAudioSession: mocks.startAudio,
    stopAudioSession: mocks.stopAudio,
  },
}));
vi.mock("@livekit/react-native-webrtc", () => ({
  mediaDevices: { getUserMedia: mocks.permission },
}));
vi.mock("@/features/voice/actions", () => ({
  createVoiceSession: mocks.create,
  deleteVoiceSession: mocks.remove,
}));
vi.mock("livekit-client", () => ({
  RoomEvent: {
    ParticipantAttributesChanged: "attributes",
    ParticipantConnected: "joined",
    ParticipantDisconnected: "left",
    Disconnected: "disconnected",
  },
  Room: class {
    remoteParticipants = new Map(
      mocks.agentReady
        ? [
            [
              "agent",
              {
                identity: "agent",
                get attributes() {
                  return {
                    "codaloud.voice.ready": "true",
                    "codaloud.voice.error": mocks.agentError,
                  };
                },
              },
            ],
          ]
        : [],
    );
    localParticipant = {
      setMicrophoneEnabled: mocks.microphone,
      performRpc: mocks.rpc,
    };
    connect = mocks.connect;
    disconnect = mocks.disconnect;
    on = (event: string, callback: (...args: any[]) => void) => {
      if (!mocks.listeners.has(event)) mocks.listeners.set(event, new Set());
      mocks.listeners.get(event)!.add(callback);
      return this;
    };
    off = (event: string, callback: (...args: any[]) => void) => {
      mocks.listeners.get(event)?.delete(callback);
      return this;
    };
    removeAllListeners = () => mocks.listeners.clear();
    registerTextStreamHandler = (
      _topic: string,
      callback: typeof mocks.transcription,
    ) => {
      mocks.transcription = callback;
    };
    unregisterTextStreamHandler = vi.fn();
  },
}));
const events = () => ({
  onSegment: vi.fn(),
  onAgentState: vi.fn(),
  onError: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.order = [];
  mocks.agentReady = true;
  mocks.agentError = "";
  mocks.listeners.clear();
  mocks.transcription = undefined;
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.startAudio.mockResolvedValue(undefined);
  mocks.stopAudio.mockResolvedValue(undefined);
  mocks.permission.mockResolvedValue({
    getTracks: () => [{ stop: mocks.trackStop }],
  });
  mocks.create.mockResolvedValue({
    serverUrl: "wss://example.test",
    token: "token",
    roomName: "room",
    participantIdentity: "user",
    mode: "hold",
  });
  mocks.microphone.mockImplementation(async (enabled) => {
    mocks.order.push(`mic:${enabled}`);
  });
  mocks.rpc.mockImplementation(async ({ payload }) => {
    mocks.order.push(JSON.parse(payload).action);
  });
});
it("authorizes the agent before publishing and mutes before committing", async () => {
  const connection = await connectNativeVoice(
    "hold",
    new AbortController().signal,
    events(),
  );
  expect(mocks.microphone).not.toHaveBeenCalled();
  expect(mocks.trackStop).toHaveBeenCalledOnce();
  await connection.control("start");
  await connection.control("commit");
  expect(mocks.order).toEqual(["start", "mic:true", "mic:false", "commit"]);
  await connection.close();
  await connection.close();
  expect(mocks.stopAudio).toHaveBeenCalledOnce();
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("room");
});
it("denied microphone access never allocates a room", async () => {
  mocks.permission.mockRejectedValueOnce(new Error("denied"));
  await expect(
    connectNativeVoice("hold", new AbortController().signal, events()),
  ).rejects.toThrow("Microphone permission");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("connection failure deletes the allocated room and stops audio", async () => {
  mocks.connect.mockRejectedValueOnce(new Error("network"));
  await expect(
    connectNativeVoice("hands-free", new AbortController().signal, events()),
  ).rejects.toThrow();
  expect(mocks.remove).toHaveBeenCalledWith("room");
  expect(mocks.stopAudio).toHaveBeenCalledOnce();
});
it("cancellation during permission acquisition stops the temporary track", async () => {
  const controller = new AbortController();
  mocks.permission.mockImplementationOnce(async () => {
    controller.abort();
    return { getTracks: () => [{ stop: mocks.trackStop }] };
  });
  await expect(
    connectNativeVoice("hold", controller.signal, events()),
  ).rejects.toThrow();
  expect(mocks.trackStop).toHaveBeenCalledOnce();
  expect(mocks.create).not.toHaveBeenCalled();
});

it("waits for a previous room to release native audio before starting another", async () => {
  const first = await connectNativeVoice(
    "hold",
    new AbortController().signal,
    events(),
  );
  const pending = connectNativeVoice(
    "hands-free",
    new AbortController().signal,
    events(),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mocks.create).toHaveBeenCalledOnce();
  await first.close();
  const second = await pending;
  expect(mocks.create).toHaveBeenCalledTimes(2);
  await second.close();
});

it("disconnects once when stopping an active conversation", async () => {
  const controller = createVoiceController(connectNativeVoice);
  await controller.start("hold");
  await controller.stop();
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.stopAudio).toHaveBeenCalledOnce();
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("room");
});

it("finishes an in-flight microphone publication before disconnecting and releasing audio", async () => {
  let finish!: () => void;
  mocks.microphone.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const signal = new AbortController();
  const connection = await connectNativeVoice("hold", signal.signal, events());
  const starting = connection.control("start");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  signal.abort();
  const closing = connection.close();
  // Disconnect must still own the newly published track when it stops tracks.
  const earlyDisconnects = mocks.disconnect.mock.calls.length;
  finish();
  await starting;
  await closing;
  expect(earlyDisconnects).toBe(0);
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.stopAudio).toHaveBeenCalledOnce();
});

it("cancels a pending room connection and releases audio once", async () => {
  let rejectConnect!: (error: Error) => void;
  mocks.connect.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectConnect = reject;
      }),
  );
  mocks.disconnect.mockImplementationOnce(async () =>
    rejectConnect(new Error("cancelled")),
  );
  const signal = new AbortController();
  const result = connectNativeVoice("hold", signal.signal, events()).catch(
    (error: unknown) => error,
  );
  await vi.waitFor(() => expect(rejectConnect).toBeTypeOf("function"));
  signal.abort();
  expect(await result).toEqual(
    expect.objectContaining({ message: "cancelled" }),
  );
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(mocks.stopAudio).toHaveBeenCalledOnce();
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("room");
});

it("streams user text while holding and keeps receiving the assistant after release", async () => {
  const controller = createVoiceController(connectNativeVoice);
  const deliver = async (
    id: string,
    identity: string,
    text: string,
    final: boolean,
  ) => {
    mocks.transcription!(
      {
        info: {
          id: crypto.randomUUID(),
          attributes: {
            "lk.segment_id": id,
            "lk.transcription_final": String(final),
          },
        },
        async *[Symbol.asyncIterator]() {
          yield text;
        },
      },
      { identity },
    );
    await vi.waitFor(() =>
      expect(controller.getSnapshot().transcript).toContainEqual({
        id,
        role: identity === "user" ? "user" : "assistant",
        text,
        final,
      }),
    );
  };
  try {
    await controller.start("hold");
    await deliver("user-turn", "user", "Hello", false);
    expect(controller.getSnapshot().listening).toBe(true);
    await controller.release();
    await deliver("user-turn", "user", "Hello there", true);
    await deliver("agent-turn", "agent", "How can I help?", true);
    expect(controller.getSnapshot().connection).toBe("connected");
    expect(controller.getSnapshot().transcript).toHaveLength(2);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  } finally {
    await controller.stop();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("reports an absent agent separately from a failed room connection", async () => {
  vi.useFakeTimers();
  mocks.agentReady = false;
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const callbacks = events();
  const pending = connectNativeVoice(
    "hands-free",
    new AbortController().signal,
    callbacks,
  );
  const rejected = pending.catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(await rejected).toEqual(
    expect.objectContaining({
      message: expect.stringMatching(/room connected.*agent.*offline/i),
    }),
  );
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(mocks.microphone).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalledWith("room");
  expect(callbacks.onError).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalledWith(
    expect.stringContaining("codaloud-voice"),
  );
});

it.each([
  { mode: "hold", responds: true },
  { mode: "hands-free", responds: true },
  { mode: "hands-free", responds: false },
] as const)(
  "handles $mode control with a responding agent: $responds",
  async ({ mode, responds }) => {
    vi.useFakeTimers();
    const sdk =
      await vi.importActual<typeof import("livekit-client")>("livekit-client");
    const sdkRoom = new sdk.Room({ disconnectOnPageLeave: false });
    // Keep the installed SDK's real timeout/ack handling. Only replace the wire;
    // no WebRTC connection, microphone, or provider call is made by this room.
    vi.spyOn(sdkRoom.engine, "sendDataPacket").mockImplementation(
      async (packet) => {
        if (packet.value.case !== "rpcRequest")
          throw new Error("Unexpected packet");
        const { id } = packet.value.value;
        setTimeout(
          () => sdkRoom["rpcClientManager"].handleIncomingRpcAck(id),
          50,
        );
        if (responds)
          setTimeout(
            () =>
              sdkRoom["rpcClientManager"].handleIncomingRpcResponseSuccess(
                id,
                "ok",
              ),
            100,
          );
      },
    );
    mocks.rpc.mockImplementation((params) =>
      sdkRoom.localParticipant.performRpc(params),
    );
    const controller = createVoiceController(connectNativeVoice);
    try {
      const starting = controller.start(mode);
      if (responds) {
        await vi.advanceTimersByTimeAsync(100);
        await starting;
        expect(controller.getSnapshot()).toMatchObject({
          connection: "connected",
          listening: true,
          error: null,
        });
        expect(mocks.microphone).toHaveBeenCalledWith(true, expect.any(Object));
        expect(mocks.disconnect).not.toHaveBeenCalled();
      } else {
        await vi.advanceTimersByTimeAsync(14_999);
        expect(controller.getSnapshot().connection).toBe("connected");
        expect(mocks.disconnect).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await starting;
        expect(controller.getSnapshot()).toMatchObject({
          connection: "error",
          listening: false,
          error: "Response timeout",
        });
        expect(mocks.microphone).not.toHaveBeenCalled();
        expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("room");
      }
    } finally {
      await controller.stop();
      await sdkRoom.disconnect();
    }
  },
);

it("delivers provider failure to the visible conversation while preserving its transcript", async () => {
  const controller = createVoiceController(connectNativeVoice);
  await controller.start("hands-free");
  mocks.agentError = "unavailable";
  for (const listener of mocks.listeners.get("attributes") ?? []) listener();
  await vi.waitFor(() =>
    expect(controller.getSnapshot()).toMatchObject({
      connection: "error",
      listening: false,
      error: "Failed to generate response. Please try again.",
    }),
  );
  await controller.stop();
});
