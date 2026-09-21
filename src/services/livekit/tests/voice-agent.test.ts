import { afterEach, beforeEach, expect, it, vi } from "vitest";
import agent from "../voice-agent";
const mocks = vi.hoisted(() => ({
  options: vi.fn(),
  start: vi.fn(),
  close: vi.fn(),
  audio: vi.fn(),
  attributes: vi.fn(),
  shutdown: vi.fn(),
  wait: vi.fn(),
  register: vi.fn(),
}));
vi.mock("@/data/env/server", () => ({
  serverEnv: { DEEPGRAM_API_KEY: "test", ELEVENLABS_API_KEY: "test" },
}));
vi.mock("../voice-llm", () => ({ VoiceLanguageModel: class {} }));
vi.mock("@livekit/agents-plugin-deepgram", () => ({ STT: class {} }));
vi.mock("@livekit/agents-plugin-elevenlabs", () => ({ TTS: class {} }));
vi.mock("@livekit/agents", () => ({
  defineAgent: (definition: unknown) => definition,
  voice: {
    AgentSessionEventTypes: { Error: "error", Close: "close" },
    Agent: { create: (options: unknown) => options },
    StopResponse: class extends Error {},
    AgentSession: class {
      constructor(options: unknown) {
        mocks.options(options);
      }
      input = { setAudioEnabled: mocks.audio };
      on = vi.fn();
      start = mocks.start;
      close = mocks.close;
    },
  },
}));
let cleanup: () => Promise<void>;
const context = () =>
  ({
    job: {
      id: "job",
      metadata: JSON.stringify({ participantIdentity: "owner", mode: "hold" }),
    },
    room: {
      name: "room",
      localParticipant: {
        registerRpcMethod: mocks.register,
        setAttributes: mocks.attributes,
      },
    },
    connect: vi.fn().mockResolvedValue(undefined),
    waitForParticipant: mocks.wait,
    shutdown: mocks.shutdown,
    addShutdownCallback: (callback: () => Promise<void>) => {
      cleanup = callback;
    },
  }) as unknown as Parameters<typeof agent.entry>[0];
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.start.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.attributes.mockResolvedValue(undefined);
  mocks.wait.mockResolvedValue({ identity: "owner" });
});
afterEach(() => vi.useRealTimers());
it("starts a non-recording pipeline with automatic speculation disabled, then advertises readiness", async () => {
  await agent.entry(context());
  expect(mocks.options).toHaveBeenCalledWith(
    expect.objectContaining({
      turnHandling: expect.objectContaining({
        turnDetection: "manual",
        preemptiveGeneration: { enabled: false },
      }),
    }),
  );
  expect(mocks.start).toHaveBeenCalledWith(
    expect.objectContaining({
      record: false,
      inputOptions: expect.objectContaining({
        textEnabled: false,
        participantIdentity: "owner",
      }),
      outputOptions: { transcriptionEnabled: true, syncTranscription: false },
    }),
  );
  expect(mocks.audio).toHaveBeenLastCalledWith(false);
  expect(mocks.attributes).toHaveBeenCalledWith({
    "codaloud.voice.ready": "true",
  });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.shutdown).not.toHaveBeenCalled();
  await cleanup();
  expect(mocks.close).toHaveBeenCalledOnce();
});
it("ends an abandoned dispatch when the owner never joins", async () => {
  mocks.wait.mockReturnValue(new Promise(() => {}));
  await agent.entry(context());
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.shutdown).toHaveBeenCalledWith("Voice participant did not join");
  await cleanup();
  expect(vi.getTimerCount()).toBe(0);
});
