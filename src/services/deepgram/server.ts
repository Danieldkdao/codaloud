import { DeepgramClient } from "@deepgram/sdk";

import { serverEnv } from "@/data/env/server";

// Server-only. Constructing the client does not open an audio connection.
export const deepgram = new DeepgramClient({
  apiKey: serverEnv.DEEPGRAM_API_KEY,
  timeoutInSeconds: 30,
  maxRetries: 0,
  reconnect: false,
});

// Attach handlers to the returned closed socket before connect()/waitForOpen().
// The caller must supply the actual audio encoding, sample rate, and channels.
// Finalized segments are not automatically accepted user turns.
export const createTranscriptionConnection = (
  options: Omit<
    Parameters<typeof deepgram.listen.v1.connect>[0],
    "Authorization" | "model"
  > & {
    model?: Parameters<typeof deepgram.listen.v1.connect>[0]["model"];
  } = {},
) =>
  deepgram.listen.v1.connect({
    model: "nova-3",
    interim_results: "true",
    punctuate: "true",
    smart_format: "true",
    vad_events: "true",
    endpointing: 300,
    utterance_end_ms: 1000,
    connectionTimeoutInSeconds: 15,
    reconnectAttempts: 0,
    ...options,
  });
