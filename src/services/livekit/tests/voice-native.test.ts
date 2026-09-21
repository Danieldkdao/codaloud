import { beforeEach, expect, it, vi } from "vitest";
import { connectNativeVoice } from "../voice-native";
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
    ParticipantDisconnected: "left",
    Disconnected: "disconnected",
  },
  Room: class {
    remoteParticipants = new Map([
      [
        "agent",
        { identity: "agent", attributes: { "codaloud.voice.ready": "true" } },
      ],
    ]);
    localParticipant = {
      setMicrophoneEnabled: mocks.microphone,
      performRpc: mocks.rpc,
    };
    connect = mocks.connect;
    disconnect = mocks.disconnect;
    on = vi.fn().mockReturnThis();
    off = vi.fn().mockReturnThis();
    removeAllListeners = vi.fn();
    registerTextStreamHandler = vi.fn();
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
