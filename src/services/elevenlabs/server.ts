import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";

import { serverEnv } from "@/data/env/server";

export const elevenlabs = new ElevenLabsClient({
  apiKey: serverEnv.ELEVENLABS_API_KEY,
  timeoutInSeconds: 30,
  maxRetries: 0,
});

// Server-only streaming audio for a complete text segment. Incremental LLM text
// input and interruption handling belong to the future LiveKit worker adapter.
// Voice selection is explicit; PCM 24 kHz must match the consuming audio pipeline.
export const streamSpeech = (
  voiceId: string,
  request: ElevenLabs.StreamTextToSpeechRequest,
  requestOptions?: Parameters<typeof elevenlabs.textToSpeech.stream>[2],
) =>
  elevenlabs.textToSpeech.stream(
    voiceId,
    {
      modelId: "eleven_flash_v2_5",
      outputFormat: "pcm_24000",
      ...request,
    },
    requestOptions,
  );
