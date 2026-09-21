import { defineAgent, voice } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import {
  voiceControlMethod,
  voiceInstructions,
  voiceSessionDurationMs,
} from "@/features/voice/constants";
import { voiceModes } from "@/features/voice/schemas";
import { createVoiceControlHandler } from "./voice-controls";
import { VoiceLanguageModel } from "./voice-llm";

const voiceDispatchSchema = z.object({
  participantIdentity: z.string().min(1),
  mode: z.enum(voiceModes),
});
export type VoiceDispatchSchema = z.infer<typeof voiceDispatchSchema>;

export default defineAgent({
  entry: async (ctx) => {
    const metadata = voiceDispatchSchema.parse(JSON.parse(ctx.job.metadata));
    const session = new voice.AgentSession({
      stt: new deepgram.STT({
        apiKey: serverEnv.DEEPGRAM_API_KEY,
        model: "nova-3",
        language: "en",
        interimResults: true,
        endpointing: 500,
        utteranceEndMs: 1000,
      }),
      llm: new VoiceLanguageModel(ctx.room.name ?? ctx.job.id),
      tts: new elevenlabs.TTS({
        apiKey: serverEnv.ELEVENLABS_API_KEY,
        voiceId: serverEnv.ELEVENLABS_VOICE_ID,
        model: "eleven_flash_v2_5",
        encoding: "pcm_22050",
      }),
      // Local Silero VAD is the Agents 1.9 default. No paid turn detector is used.
      turnHandling: {
        turnDetection: "manual",
        preemptiveGeneration: { enabled: false },
        interruption: { enabled: true, mode: "vad" },
      },
      connOptions: {
        sttConnOptions: { maxRetry: 0 },
        llmConnOptions: { maxRetry: 0 },
        ttsConnOptions: { maxRetry: 0 },
        maxUnrecoverableErrors: 1,
      },
    });
    const timer = setTimeout(
      () => ctx.shutdown("Voice session time limit"),
      voiceSessionDurationMs,
    );
    ctx.addShutdownCallback(async () => {
      clearTimeout(timer);
      await session.close();
    });
    session.on(voice.AgentSessionEventTypes.Error, () => {
      void ctx.room.localParticipant
        ?.setAttributes({ "codaloud.voice.error": "unavailable" })
        .finally(() => ctx.shutdown("Voice provider unavailable"));
    });
    session.on(voice.AgentSessionEventTypes.Close, () =>
      ctx.shutdown("Voice session closed"),
    );
    const agent = voice.Agent.create({
      instructions: voiceInstructions,
      onUserTurnCompleted: async (_context, _chatCtx, message) => {
        if (!message.textContent?.trim()) throw new voice.StopResponse();
      },
    });
    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        textEnabled: false,
        participantIdentity: metadata.participantIdentity,
      },
      outputOptions: { transcriptionEnabled: true, syncTranscription: false },
      record: false,
    });
    session.input.setAudioEnabled(false);
    await ctx.connect();
    const handleControl = createVoiceControlHandler(
      session,
      metadata.participantIdentity,
    );
    ctx.room.localParticipant!.registerRpcMethod(voiceControlMethod, (data) =>
      handleControl(data.callerIdentity, data.payload),
    );
    await ctx.room.localParticipant!.setAttributes({
      "codaloud.voice.ready": "true",
    });
  },
});
