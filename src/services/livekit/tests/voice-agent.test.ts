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
  outputAudio: vi.fn(),
  updateVoice: vi.fn(),
}));
vi.mock("@/data/env/server", () => ({
  serverEnv: { DEEPGRAM_API_KEY: "test", ELEVENLABS_API_KEY: "test" },
}));
vi.mock("../voice-llm", () => ({ VoiceLanguageModel: class {} }));
vi.mock("@livekit/agents-plugin-deepgram", () => ({ STT: class {} }));
vi.mock("@livekit/agents-plugin-elevenlabs", () => ({
  TTS: class {
    updateOptions = mocks.updateVoice;
  },
}));
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
      output = { setAudioEnabled: mocks.outputAudio };
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
it("starts muted with an audio output that can be enabled without reconnecting", async () => {
  const ctx = context();
  ctx.job.metadata = JSON.stringify({
    participantIdentity: "owner",
    mode: "hold",
    speechEnabled: false,
    voiceId: "EXAVITQu4vr4xnSDxMaL",
  });
  await agent.entry(ctx);
  expect(mocks.start).toHaveBeenCalledWith(
    expect.objectContaining({
      outputOptions: expect.objectContaining({
        audioEnabled: true,
        transcriptionEnabled: true,
      }),
    }),
  );
  expect(mocks.outputAudio).toHaveBeenLastCalledWith(false);
  mocks.outputAudio.mockClear();
  const handler = mocks.register.mock.calls.find(
    ([method]) => method === "codaloud.voice.preferences",
  )![1];
  const payload = JSON.stringify({
    speechEnabled: true,
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
  });
  await expect(
    handler({ callerIdentity: "intruder", payload }),
  ).rejects.toThrow("Unauthorized");
  expect(mocks.outputAudio).not.toHaveBeenCalled();
  await handler({ callerIdentity: "owner", payload });
  expect(mocks.outputAudio).toHaveBeenCalledWith(true);
  await handler({
    callerIdentity: "owner",
    payload: JSON.stringify({
      speechEnabled: false,
      voiceId: "JBFqnCBsd6RMkjVDRZzb",
    }),
  });
  await handler({ callerIdentity: "owner", payload });
  expect(mocks.outputAudio.mock.calls.map(([enabled]) => enabled)).toEqual([
    true,
    false,
    true,
  ]);
  expect(mocks.start).toHaveBeenCalledOnce();
  expect(mocks.updateVoice).toHaveBeenCalledWith({
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
  });
  await cleanup();
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
      outputOptions: {
        audioEnabled: true,
        transcriptionEnabled: true,
        syncTranscription: false,
      },
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
