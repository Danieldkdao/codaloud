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
  charge: vi.fn(),
  ttsOn: vi.fn(),
  sessionOn: vi.fn(),
  workspace: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/features/billing/server/billing-service", () => ({
  chargeCredits: mocks.charge,
  InsufficientCreditsError: class extends Error {},
}));
import { InsufficientCreditsError } from "@/features/billing/server/billing-service";
vi.mock("@/data/env/server", () => ({
  serverEnv: { DEEPGRAM_API_KEY: "test", ELEVENLABS_API_KEY: "test" },
}));
vi.mock("../voice-llm", () => ({
  VoiceLanguageModel: class {
    constructor(_id: string, _plan: unknown, workspace: unknown) {
      mocks.workspace(workspace);
    }
  },
}));
vi.mock("@livekit/agents-plugin-deepgram", () => ({ STT: class {} }));
vi.mock("@livekit/agents-plugin-elevenlabs", () => ({
  TTS: class {
    updateOptions = mocks.updateVoice;
    on = mocks.ttsOn;
  },
}));
vi.mock("@livekit/agents", () => ({
  defineAgent: (definition: unknown) => definition,
  voice: {
    AgentSessionEventTypes: {
      Error: "error",
      Close: "close",
      AgentStateChanged: "agent-state",
      UserStateChanged: "user-state",
    },
    Agent: { create: (options: unknown) => options },
    StopResponse: class extends Error {},
    AgentSession: class {
      constructor(options: unknown) {
        mocks.options(options);
      }
      input = { setAudioEnabled: mocks.audio };
      output = { setAudioEnabled: mocks.outputAudio };
      on = mocks.sessionOn;
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
        performRpc: mocks.rpc,
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
  mocks.charge.mockResolvedValue({ monthlyCredits: 50 });
  mocks.rpc.mockResolvedValue(JSON.stringify({ id: "turn-one" }));
});
it("does not replace an active tool request when a late speaking event arrives", async () => {
  let currentId = "";
  let sequence = 0;
  mocks.rpc.mockImplementation(async ({ method, payload }) => {
    if (method === "codaloud.voice.context") {
      currentId = `turn-${++sequence}`;
      return JSON.stringify({ id: currentId });
    }
    if (JSON.parse(payload).id !== currentId)
      throw new Error("Request cancelled or workspace changed.");
    return JSON.stringify({ ok: true });
  });
  await agent.entry(context());
  const workspace = mocks.workspace.mock.calls[0][0];
  const first = await workspace.context();
  for (const [event, handler] of mocks.sessionOn.mock.calls) {
    if (event === "user-state") handler({ newState: "speaking" });
  }
  await expect(
    workspace.rpc("codaloud.voice.read", {
      id: first.id,
      name: "readFile",
      args: { path: "src/lib/utils.ts" },
    }),
  ).resolves.toEqual({ ok: true });
  await expect(
    workspace.rpc("codaloud.voice.action", {
      id: first.id,
      name: "editFile",
      args: { path: "src/lib/utils.ts" },
    }),
  ).resolves.toEqual({ ok: true });
  expect(
    mocks.rpc.mock.calls.filter(
      ([call]) => call.method === "codaloud.voice.context",
    ),
  ).toHaveLength(1);
  expect(JSON.parse(mocks.rpc.mock.calls.at(-1)![0].payload).id).toBe(first.id);
  await workspace.context();
  expect(
    mocks.rpc.mock.calls.filter(
      ([call]) => call.method === "codaloud.voice.context",
    ),
  ).toHaveLength(2);
  await cleanup();
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
it("charges each started connected minute and synthesized speech", async () => {
  await agent.entry(context());
  await Promise.resolve();
  expect(mocks.charge).toHaveBeenCalledWith(
    "owner",
    "voice-minute:job:0",
    3,
    "Voice connection · minute 1",
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.charge).toHaveBeenCalledWith(
    "owner",
    "voice-minute:job:1",
    3,
    "Voice connection · minute 2",
  );
  await cleanup();
});
it("marks exhausted voice-minute credits as a billing error for the phone", async () => {
  mocks.charge.mockRejectedValueOnce(new InsufficientCreditsError());
  await agent.entry(context());
  await vi.waitFor(() =>
    expect(mocks.attributes).toHaveBeenCalledWith({
      "codaloud.voice.error": "credits",
    }),
  );
  await cleanup();
});
it("marks exhausted speech credits as a billing error for the phone", async () => {
  await agent.entry(context());
  await Promise.resolve();
  mocks.charge.mockRejectedValueOnce(new InsufficientCreditsError());
  const onMetrics = mocks.ttsOn.mock.calls.find(
    ([name]) => name === "metrics_collected",
  )![1];
  onMetrics({ cancelled: false, charactersCount: 150 });
  await vi.waitFor(() =>
    expect(mocks.attributes).toHaveBeenCalledWith({
      "codaloud.voice.error": "credits",
    }),
  );
  await cleanup();
});
