import { getCurrentUser } from "@/lib/auth/helpers";
import { streamSpeech } from "@/services/elevenlabs/server";
import { explanationSpeechRequestSchema } from "../explanation-schemas";

const failure = "Couldn’t prepare the audio for this explanation.";
const reject = (message: string, status: number) =>
  Response.json(
    { message },
    { status, headers: { "Cache-Control": "no-store" } },
  );

// ElevenLabs returns headerless 16-bit PCM. Players need a RIFF container.
const toWav = (pcm: Uint8Array, sampleRate: number) => {
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++)
      view.setUint8(offset + index, text.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return wav;
};

/**
 * Synthesizes one explanation sentence. The API key stays on the server, so the
 * client only ever receives playable audio.
 */
export const handleExplanationSpeechRequest = async (request: Request) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) return reject("Sign in to hear explanations.", 401);
    const text = await request.text();
    if (text.length > 4000) return reject("Invalid speech request.", 400);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return reject("Invalid speech request.", 400);
    }
    const input = explanationSpeechRequestSchema.safeParse(body);
    if (!input.success) return reject("Invalid speech request.", 400);
    if (request.signal.aborted) return reject("Request cancelled.", 499);
    const stream = await streamSpeech(input.data.voiceId, {
      text: input.data.text,
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    if (request.signal.aborted) return reject("Request cancelled.", 499);
    if (!chunks.length) return reject(failure, 502);
    const pcm = new Uint8Array(
      chunks.reduce((length, chunk) => length + chunk.byteLength, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(toWav(pcm, 24000), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return reject(failure, 503);
  }
};
