import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { DataStreamErrorReason } from "livekit-client";
import { inlineSession } from "@/features/voice/inline-session";
import { connectNativeVoice } from "../voice-native";
import { createVoiceController } from "@/features/voice/voice-controller";
import { voiceAudioSession } from "../voice-track";
import { agentTasks } from "@/features/agent/task-runtime";
import { agentPlans } from "@/features/agent/plan-runtime";
vi.mock("@/features/agent/plan-runtime", () => ({
  agentPlans: {
    propose: vi
      .fn()
      .mockResolvedValue({ reviewRequired: true, accepted: false }),
  },
}));
vi.mock("@/features/agent/task-runtime", () => ({
  agentTasks: {
    getSnapshot: () => [],
    subscribe: () => () => {},
    enqueue: vi.fn(),
  },
}));
vi.mock("@/features/settings/hooks/use-editor-preferences", () => ({
  editorPreferencesStore: {
    getSnapshot: () => ({
      preferences: { speechEnabled: true, voiceId: "JBFqnCBsd6RMkjVDRZzb" },
    }),
    subscribe: () => () => {},
  },
}));
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  trackStop: vi.fn(),
  startAudio: vi.fn(),
  configureAudio: vi.fn(),
  stopAudio: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  microphone: vi.fn(),
  rpc: vi.fn(),
  register: vi.fn(),
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
  setupIOSAudioManagement: vi.fn(),
  AudioSession: {
    setAppleAudioConfiguration: mocks.configureAudio,
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
  DataStreamErrorReason: {
    AlreadyOpened: 0,
    AbnormalEnd: 1,
    DecodeFailed: 2,
    LengthExceeded: 3,
    Incomplete: 4,
    HandlerAlreadyRegistered: 7,
    EncryptionTypeMismatch: 8,
    HeaderTooLarge: 9,
    PayloadTooLarge: 10,
  },
  Track: { Source: { Microphone: "microphone" }, Kind: { Audio: "audio" } },
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
                audioTrackPublications: new Map(),
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
      registerRpcMethod: vi.fn(),
      getTrackPublication: () => undefined,
    };
    connect = mocks.connect;
    disconnect = mocks.disconnect;
    registerRpcMethod = mocks.register;
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
  mocks.remove.mockResolvedValue(undefined);
  mocks.startAudio.mockResolvedValue(undefined);
  mocks.configureAudio.mockResolvedValue(undefined);
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
    const action = JSON.parse(payload).action;
    if (action) mocks.order.push(action);
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
it("presents the authorized agent's plan without starting a task", async () => {
  const connection = await connectNativeVoice(
    "hold",
    new AbortController().signal,
    events(),
    { projectId: "project" },
  );
  const handler = mocks.register.mock.calls.find(
    ([name]) => name === "codaloud.plan.propose",
  )![1];
  const request = await inlineSession.begin("project");
  const payload = JSON.stringify({
    instruction: "Read the root folder",
    id: "call",
    title: "Explore project",
    requestId: request.id,
  });
  await expect(
    handler({ callerIdentity: "intruder", payload }),
  ).rejects.toThrow("Workspace unavailable");
  expect(
    JSON.parse(await handler({ callerIdentity: "agent", payload })),
  ).toEqual({ reviewRequired: true, accepted: false });
  expect(agentTasks.enqueue).not.toHaveBeenCalled();
  expect(
    mocks.register.mock.calls.some(([name]) => name === "codaloud.task.start"),
  ).toBe(false);
  expect(agentPlans.propose).toHaveBeenCalledExactlyOnceWith(
    "project",
    "Read the root folder",
    "room:call",
    "Explore project",
  );
  inlineSession.cancel();
  await expect(handler({ callerIdentity: "agent", payload })).rejects.toThrow(
    /cancel/i,
  );
  expect(agentPlans.propose).toHaveBeenCalledOnce();
  await connection.close();
});
it("denied microphone access never allocates a room", async () => {
  mocks.permission.mockRejectedValueOnce(new Error("denied"));
  await expect(
    connectNativeVoice("hold", new AbortController().signal, events()),
  ).rejects.toThrow("Microphone permission");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(voiceAudioSession.getSnapshot()).toBe(false);
});

it("prepares native audio before activation or room playback can start", async () => {
  let finish!: () => void;
  mocks.configureAudio.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = connectNativeVoice(
    "hold",
    new AbortController().signal,
    events(),
  );
  try {
    await vi.waitFor(() => expect(mocks.configureAudio).toHaveBeenCalledOnce());
    expect(mocks.startAudio).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(mocks.startAudio).toHaveBeenCalledOnce();
    expect(mocks.connect).toHaveBeenCalledOnce();
  } finally {
    finish?.();
    await (await pending).close();
  }
});

it("claims audio before permission capture and waits for pending preview cleanup", async () => {
  let finish!: () => void;
  voiceAudioSession.set(false);
  const releasing = voiceAudioSession.releasePreview(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  const pending = connectNativeVoice(
    "hold",
    new AbortController().signal,
    events(),
  );
  await Promise.resolve();
  expect(voiceAudioSession.getSnapshot()).toBe(true);
  expect(mocks.permission).not.toHaveBeenCalled();
  mocks.permission.mockImplementationOnce(async () => {
    expect(voiceAudioSession.getSnapshot()).toBe(true);
    return { getTracks: () => [{ stop: mocks.trackStop }] };
  });
  finish();
  await releasing;
  const connection = await pending;
  await connection.close();
  expect(voiceAudioSession.getSnapshot()).toBe(false);
});

it("cancels while preview cleanup is pending without opening a microphone", async () => {
  let finish!: () => void;
  voiceAudioSession.set(false);
  const releasing = voiceAudioSession.releasePreview(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  const signal = new AbortController();
  const pending = connectNativeVoice("hold", signal.signal, events()).catch(
    (error: unknown) => error,
  );
  await Promise.resolve();
  signal.abort();
  finish();
  await releasing;
  expect(await pending).toEqual(
    expect.objectContaining({ message: "Voice connection cancelled." }),
  );
  expect(mocks.permission).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(voiceAudioSession.getSnapshot()).toBe(false);
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
  expect(voiceAudioSession.getSnapshot()).toBe(false);
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
  const callbacks = events();
  const result = connectNativeVoice("hold", signal.signal, callbacks).catch(
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
  expect(callbacks.onError).not.toHaveBeenCalled();
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
it("keeps voice connected when a transcript stream fails during an assistant answer", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const controller = createVoiceController(connectNativeVoice);
  let failTranscript!: () => void;
  const interrupted = new Promise<void>((resolve) => {
    failTranscript = resolve;
  });
  try {
    await controller.start("hands-free");
    mocks.transcription!(
      {
        info: {
          id: "file-explanation",
          attributes: { "lk.segment_id": "answer" },
        },
        async *[Symbol.asyncIterator]() {
          yield "This file defines the agent procedures.";
          await interrupted;
          // A real gap in the payload is the one case that means text was dropped;
          // the banner is reserved for genuine loss, not a plain unclassified Error.
          throw Object.assign(new Error("Data stream incomplete"), {
            reason: DataStreamErrorReason.Incomplete,
          });
        },
      },
      { identity: "agent" },
    );
    await vi.waitFor(() =>
      expect(controller.getSnapshot().transcript).toHaveLength(1),
    );
    failTranscript();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(controller.getSnapshot()).toMatchObject({
      connection: "connected",
      error: null,
    });
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(controller.getSnapshot().transcriptWarning).toMatch(
      /transcript.*missing/i,
    );
    mocks.transcription!(
      {
        info: { id: "next-answer", attributes: { "lk.segment_id": "next" } },
        async *[Symbol.asyncIterator]() {
          yield "The next response still works.";
        },
      },
      { identity: "agent" },
    );
    await vi.waitFor(() =>
      expect(controller.getSnapshot().transcript).toContainEqual(
        expect.objectContaining({
          id: "next",
          text: "The next response still works.",
          final: true,
        }),
      ),
    );
  } finally {
    await controller.stop();
  }
});
it("still treats an actual room disconnect as fatal", async () => {
  const controller = createVoiceController(connectNativeVoice);
  try {
    await controller.start("hands-free");
    for (const listener of mocks.listeners.get("disconnected") ?? [])
      listener();
    await vi.waitFor(() =>
      expect(controller.getSnapshot()).toMatchObject({
        connection: "error",
        error: "Voice disconnected. Please try again.",
      }),
    );
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  } finally {
    await controller.stop();
  }
});
it("ignores a late stream error and text after its room has closed", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const callbacks = { ...events(), onTranscriptWarning: vi.fn() };
  const connection = await connectNativeVoice(
    "hold",
    new AbortController().signal,
    callbacks,
  );
  const handler = mocks.transcription!;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  handler(
    {
      info: { id: "late" },
      async *[Symbol.asyncIterator]() {
        yield "Before close";
        await pending;
        throw new Error("closed");
      },
    },
    { identity: "agent" },
  );
  await vi.waitFor(() => expect(callbacks.onSegment).toHaveBeenCalledOnce());
  await connection.close();
  callbacks.onSegment.mockClear();
  finish();
  handler(
    {
      info: { id: "too-late" },
      async *[Symbol.asyncIterator]() {
        yield "Late text";
      },
    },
    { identity: "agent" },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(callbacks.onSegment).not.toHaveBeenCalled();
  expect(callbacks.onTranscriptWarning).not.toHaveBeenCalled();
  expect(callbacks.onError).not.toHaveBeenCalled();
  expect(warning).not.toHaveBeenCalled();
});
it.each(["gap", "abnormal trailer"])(
  "isolates an installed SDK transcript failure caused by %s",
  async (failure) => {
    const sdk =
      await vi.importActual<typeof import("livekit-client")>("livekit-client");
    const source = new sdk.Room({ disconnectOnPageLeave: false });
    const manager = source["incomingDataStreamManager"];
    const controller = createVoiceController(connectNativeVoice);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await controller.start("hands-free");
      source.registerTextStreamHandler(
        "lk.transcription",
        (reader, participant) => mocks.transcription!(reader, participant),
      );
      manager["handleStreamHeader"](
        {
          streamId: "sdk-answer",
          topic: "lk.transcription",
          mimeType: "text/plain",
          timestamp: 0n,
          attributes: { "lk.segment_id": "sdk-answer" },
          compression: 0,
          contentHeader: {
            case: "textHeader",
            value: { attachedStreamIds: [] },
          },
        } as Parameters<(typeof manager)["handleStreamHeader"]>[0],
        "agent",
        0,
      );
      const chunk = (index: number) =>
        manager["handleStreamChunk"](
          {
            streamId: "sdk-answer",
            chunkIndex: BigInt(index),
            content: new TextEncoder().encode("Reading the file. "),
            version: 0,
          } as Parameters<(typeof manager)["handleStreamChunk"]>[0],
          0,
        );
      chunk(0);
      await vi.waitFor(() =>
        expect(controller.getSnapshot().transcript).toHaveLength(1),
      );
      if (failure === "gap") chunk(2);
      else
        manager["handleStreamTrailer"](
          {
            streamId: "sdk-answer",
            reason: "cancelled",
            attributes: {},
          } as Parameters<(typeof manager)["handleStreamTrailer"]>[0],
          0,
        );
      // An interrupted answer is a normal barge-in, not lost text. Only a real
      // gap in the payload is worth telling the user about.
      if (failure === "abnormal trailer") {
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(controller.getSnapshot().transcriptWarning).toBeUndefined();
        expect(warning).not.toHaveBeenCalled();
        expect(controller.getSnapshot().connection).toBe("connected");
        expect(mocks.disconnect).not.toHaveBeenCalled();
        return;
      }
      await vi.waitFor(() =>
        expect(controller.getSnapshot().transcriptWarning).toBeTruthy(),
      );
      expect(controller.getSnapshot().connection).toBe("connected");
      expect(mocks.disconnect).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith(
        "[voice] Transcript stream failed; keeping audio connected",
        expect.objectContaining({
          errorType: "DataStreamError",
          reason: sdk.DataStreamErrorReason.Incomplete,
        }),
      );
    } finally {
      manager.clearControllers();
      await controller.stop();
    }
  },
);
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
  expect(callbacks.onError).toHaveBeenCalledWith(
    expect.stringMatching(/room connected.*agent.*offline/i),
  );
  expect(warning).toHaveBeenCalledWith(
    expect.stringContaining("codaloud-voice"),
  );
});

it.each(["hold", "hands-free"] as const)(
  "leaves Connecting after an absent agent times out in %s, even while room cleanup is pending",
  async (mode) => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.agentReady = false;
    let finishCleanup!: () => void;
    mocks.remove.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    const controller = createVoiceController(connectNativeVoice);
    const starting = controller.start(mode);
    let retry: Promise<void> | undefined;
    try {
      await vi.advanceTimersByTimeAsync(20_000);
      expect(mocks.disconnect).toHaveBeenCalledOnce();
      expect(finishCleanup).toBeTypeOf("function");
      expect(controller.getSnapshot()).toMatchObject({
        connection: "error",
        listening: false,
        error: expect.stringMatching(/room connected.*agent.*offline/i),
      });
      mocks.agentReady = true;
      retry = controller.start(mode);
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.create).toHaveBeenCalledTimes(2);
      finishCleanup();
      await Promise.all([starting, retry]);
      expect(controller.getSnapshot()).toMatchObject({
        connection: "connected",
        listening: true,
        error: null,
      });
    } finally {
      finishCleanup?.();
      await Promise.all([starting, retry]);
      await controller.stop();
    }
  },
);

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
      params.method === "codaloud.voice.preferences"
        ? Promise.resolve("ok")
        : sdkRoom.localParticipant.performRpc(params),
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
        expect(controller.getSnapshot().connection).toBe("connecting");
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
it("binds authenticated suggestion RPCs to a frozen turn and rejects late updates using native cancellation", async () => {
  const nativeRequire = createRequire(
    import.meta.resolve("react-native/package.json"),
  );
  const { AbortController: NativeAbortController } = nativeRequire(
    "abort-controller",
  ) as { AbortController: typeof AbortController };
  const abort = new NativeAbortController();
  const capture = vi.fn(async () => ({
    projectId: "project",
    branch: "main",
    openFiles: [],
    activeFile: {
      path: "a.ts",
      documentKey: "doc",
      revision: 1,
      content: "hello",
      from: 0,
      to: 5,
      focused: true,
    },
  }));
  const unregister = inlineSession.register("project", {
    capture,
    preview: () => {},
    apply: async () => true,
  });
  const connection = await connectNativeVoice("hold", abort.signal, events(), {
    projectId: "project",
  });
  try {
    await connection.control("start");
    const handler = (method: string) =>
      mocks.register.mock.calls.find(([name]) => name === method)![1];
    await expect(
      handler("codaloud.voice.context")({
        callerIdentity: "intruder",
        payload: "{}",
      }),
    ).rejects.toThrow();
    const context = JSON.parse(
      await handler("codaloud.voice.context")({
        callerIdentity: "agent",
        payload: "{}",
      }),
    );
    expect(capture).toHaveBeenCalledOnce();
    const send = (event: unknown) =>
      handler("codaloud.voice.suggestion")({
        callerIdentity: "agent",
        payload: JSON.stringify(event),
      });
    await send({ id: context.id, type: "start" });
    expect(mocks.microphone).toHaveBeenLastCalledWith(false);
    await send({ id: context.id, type: "delta", offset: 0, text: "world" });
    await expect(
      send({ id: context.id, type: "delta", offset: 0, text: "duplicate" }),
    ).rejects.toThrow(/order/);
    inlineSession.cancel();
    await expect(send({ id: context.id, type: "complete" })).rejects.toThrow(
      /cancel/i,
    );
    await connection.control("start");
    expect(inlineSession.getSnapshot()?.id).not.toBe(context.id);
    abort.abort();
    await expect(
      send({ id: inlineSession.getSnapshot()!.id, type: "start" }),
    ).rejects.toThrow();
  } finally {
    await connection.close();
    unregister();
  }
});
it("acks a stale turn's trailing event instead of tearing down the live turn", async () => {
  const nativeRequire = createRequire(
    import.meta.resolve("react-native/package.json"),
  );
  const { AbortController: NativeAbortController } = nativeRequire(
    "abort-controller",
  ) as { AbortController: typeof AbortController };
  const abort = new NativeAbortController();
  const unregister = inlineSession.register("project", {
    capture: vi.fn(async () => ({
      projectId: "project",
      branch: "main",
      openFiles: [],
      activeFile: {
        path: "a.ts",
        documentKey: "doc",
        revision: 1,
        content: "hello",
        from: 0,
        to: 5,
        focused: true,
      },
    })),
    preview: () => {},
    apply: async () => true,
  });
  const connection = await connectNativeVoice("hold", abort.signal, events(), {
    projectId: "project",
  });
  try {
    await connection.control("start");
    const handler = (method: string) =>
      mocks.register.mock.calls.find(([name]) => name === method)![1];
    const send = (event: unknown) =>
      handler("codaloud.voice.suggestion")({
        callerIdentity: "agent",
        payload: JSON.stringify(event),
      });
    const first = JSON.parse(
      await handler("codaloud.voice.context")({
        callerIdentity: "agent",
        payload: "{}",
      }),
    );
    await send({ id: first.id, type: "start" });
    await send({ id: first.id, type: "delta", offset: 0, text: "world" });
    await send({ id: first.id, type: "complete" });
    expect(inlineSession.getSnapshot()?.status).toBe("ready");
    // The user does not accept and simply speaks again.
    await connection.control("hands-free");
    const second = inlineSession.getSnapshot()!;
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("listening");
    // A trailing event from the superseded turn must not kill this turn.
    await expect(send({ id: first.id, type: "answer" })).resolves.toBeDefined();
    await expect(
      send({ id: first.id, type: "complete" }),
    ).resolves.toBeDefined();
    const live = inlineSession.getSnapshot();
    expect(live?.id).toBe(second.id);
    expect(live?.status).toBe("listening");
  } finally {
    await connection.close();
    unregister();
  }
});
it("keeps a generating turn alive when the microphone is reopened", async () => {
  const nativeRequire = createRequire(
    import.meta.resolve("react-native/package.json"),
  );
  const { AbortController: NativeAbortController } = nativeRequire(
    "abort-controller",
  ) as { AbortController: typeof AbortController };
  const abort = new NativeAbortController();
  const unregister = inlineSession.register("project", {
    capture: vi.fn(async () => ({
      projectId: "project",
      branch: "main",
      openFiles: [],
      activeFile: {
        path: "a.ts",
        documentKey: "doc",
        revision: 1,
        content: "hello",
        from: 0,
        to: 5,
        focused: true,
      },
    })),
    preview: () => {},
    apply: async () => true,
  });
  const connection = await connectNativeVoice("hold", abort.signal, events(), {
    projectId: "project",
  });
  try {
    await connection.control("start");
    const handler = (method: string) =>
      mocks.register.mock.calls.find(([name]) => name === method)![1];
    const send = (event: unknown) =>
      handler("codaloud.voice.suggestion")({
        callerIdentity: "agent",
        payload: JSON.stringify(event),
      });
    const first = JSON.parse(
      await handler("codaloud.voice.context")({
        callerIdentity: "agent",
        payload: "{}",
      }),
    );
    await send({ id: first.id, type: "start" });
    expect(inlineSession.getSnapshot()?.status).toBe("generating");
    // Reopening the microphone mid-suggestion must not start a competing
    // request, and must not report the in-flight turn as a lost connection.
    await expect(connection.control("hands-free")).resolves.toBeUndefined();
    const live = inlineSession.getSnapshot();
    expect(live?.id).toBe(first.id);
    expect(live?.status).toBe("generating");
    // The in-flight turn still owns the conversation and can finish.
    await send({ id: first.id, type: "delta", offset: 0, text: "world" });
    await send({ id: first.id, type: "complete" });
    expect(inlineSession.getSnapshot()?.status).toBe("ready");
  } finally {
    await connection.close();
    unregister();
  }
});
it("allows a new room after native cleanup even while server room deletion is stalled", async () => {
  let finishDelete!: () => void;
  mocks.remove.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishDelete = resolve;
      }),
  );
  const first = await connectNativeVoice(
    "hands-free",
    new AbortController().signal,
    events(),
  );
  const closing = first.close();
  const next = connectNativeVoice(
    "hands-free",
    new AbortController().signal,
    events(),
  );
  try {
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2), {
      timeout: 150,
    });
    expect(mocks.stopAudio).toHaveBeenCalledOnce();
  } finally {
    finishDelete();
    await closing;
    await (await next).close();
  }
});
it("aborts a stalled room handshake at the startup deadline", async () => {
  vi.useFakeTimers();
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
  const callbacks = events();
  const pending = connectNativeVoice(
    "hands-free",
    new AbortController().signal,
    callbacks,
  ).catch((error) => error);
  try {
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringMatching(/timed out/i),
    );
  } finally {
    rejectConnect(new Error("test cleanup"));
    await pending;
  }
});

it("mutes a skipped inline request and rejects late code from it", async () => {
  const nativeRequire = createRequire(
    import.meta.resolve("react-native/package.json"),
  );
  const { AbortController: NativeAbortController } = nativeRequire(
    "abort-controller",
  ) as { AbortController: typeof AbortController };
  const abort = new NativeAbortController();
  const capture = vi.fn(async () => ({
    projectId: "project",
    branch: "main",
    openFiles: [],
    activeFile: {
      path: "a.ts",
      documentKey: "doc",
      revision: 1,
      content: "hello",
      from: 0,
      to: 5,
      focused: true,
    },
  }));
  const unregister = inlineSession.register("project", {
    capture,
    preview: () => {},
    apply: async () => true,
  });
  const connection = await connectNativeVoice("hold", abort.signal, events(), {
    projectId: "project",
  });
  try {
    await connection.control("start");
    const handler = (method: string) =>
      mocks.register.mock.calls.find(([name]) => name === method)![1];
    await expect(
      handler("codaloud.voice.context")({
        callerIdentity: "intruder",
        payload: "{}",
      }),
    ).rejects.toThrow();
    const context = JSON.parse(
      await handler("codaloud.voice.context")({
        callerIdentity: "agent",
        payload: "{}",
      }),
    );
    expect(capture).toHaveBeenCalledOnce();
    const send = (event: unknown) =>
      handler("codaloud.voice.suggestion")({
        callerIdentity: "agent",
        payload: JSON.stringify(event),
      });
    await send({ id: context.id, type: "answer" });
    expect(mocks.microphone).toHaveBeenLastCalledWith(false);
    expect(inlineSession.getSnapshot()?.status).toBe("answered");
    await expect(send({ id: context.id, type: "start" })).rejects.toThrow(
      /cancel|completed/i,
    );
    await connection.control("start");
    expect(inlineSession.getSnapshot()?.id).not.toBe(context.id);
    abort.abort();
    await expect(
      send({ id: inlineSession.getSnapshot()!.id, type: "start" }),
    ).rejects.toThrow();
  } finally {
    await connection.close();
    unregister();
  }
});
