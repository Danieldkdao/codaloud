// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamSpeech: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/services/elevenlabs/server", () => ({ streamSpeech: mocks.streamSpeech }));
vi.mock("@/data/env/server", () => ({ serverEnv: {} }));

const load = async () =>
  (await import("@/features/editor/server/explanation-speech-api")).handleExplanationSpeechRequest;

const post = (body: unknown) =>
  new Request("https://codaloud.test/api/editor/speak", {
    method: "POST",
    body: JSON.stringify(body),
  });

const stream = (chunks: Uint8Array[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) yield chunk;
  },
});

const readHeader = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + 4));
  return {
    riff: tag(0),
    wave: tag(8),
    fmt: tag(12),
    data: tag(36),
    riffSize: view.getUint32(4, true),
    dataSize: view.getUint32(40, true),
    sampleRate: view.getUint32(24, true),
    channels: view.getUint16(22, true),
    bitsPerSample: view.getUint16(34, true),
  };
};

beforeEach(() => {
  mocks.getCurrentUser.mockReset().mockResolvedValue({ userId: "user-one" });
  mocks.streamSpeech.mockReset().mockResolvedValue(stream([]));
});

it("requires a signed-in user", async () => {
  mocks.getCurrentUser.mockResolvedValue({ userId: null });
  const response = await (await load())(post({ text: "Hi", voiceId: "v" }));
  expect(response.status).toBe(401);
  expect(mocks.streamSpeech).not.toHaveBeenCalled();
});

it("rejects a request with no speakable text", async () => {
  const response = await (await load())(post({ text: "   ", voiceId: "v" }));
  expect(response.status).toBe(400);
  expect(mocks.streamSpeech).not.toHaveBeenCalled();
});

it("returns playable WAV audio carrying the synthesized samples", async () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);
  mocks.streamSpeech.mockResolvedValue(
    stream([pcm.slice(0, 3), pcm.slice(3)]),
  );
  const response = await (await load())(post({ text: "Hello.", voiceId: "v1" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("audio/wav");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(readHeader(bytes)).toMatchObject({
    riff: "RIFF",
    wave: "WAVE",
    fmt: "fmt ",
    data: "data",
    riffSize: 36 + pcm.byteLength,
    dataSize: pcm.byteLength,
    sampleRate: 24000,
    channels: 1,
    bitsPerSample: 16,
  });
  // The sample bytes must survive the header exactly.
  expect([...bytes.slice(44)]).toEqual([...pcm]);
});

it("asks the provider for the requested voice and text", async () => {
  mocks.streamSpeech.mockResolvedValue(stream([new Uint8Array([1])]));
  await (await load())(post({ text: "Hello.", voiceId: "voice-42" }));
  expect(mocks.streamSpeech).toHaveBeenCalledWith("voice-42", {
    text: "Hello.",
  });
});

it("fails cleanly when the provider returns no audio", async () => {
  const response = await (await load())(post({ text: "Hello.", voiceId: "v" }));
  expect(response.status).toBe(502);
});

it("fails cleanly when synthesis throws", async () => {
  mocks.streamSpeech.mockRejectedValue(new Error("provider down"));
  const response = await (await load())(post({ text: "Hello.", voiceId: "v" }));
  expect(response.status).toBe(503);
});
