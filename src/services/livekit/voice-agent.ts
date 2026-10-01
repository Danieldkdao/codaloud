import { defineAgent, voice } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import {
  voiceControlMethod,
  voiceSessionDurationMs,
} from "@/features/voice/constants";
import { voiceInstructions } from "@/services/ai/prompts";
import { voicePreferencesSchema, voiceModes } from "@/features/voice/schemas";
import { createVoiceControlHandler } from "./voice-controls";
import { VoiceLanguageModel } from "./voice-llm";
import {
  chargeCredits,
  InsufficientCreditsError,
} from "@/features/billing/server/billing-service";
import { creditsForSpeech } from "@/features/billing/credit-cost";

const voiceDispatchSchema = voicePreferencesSchema.extend({
  participantIdentity: z.string().min(1),
  mode: z.enum(voiceModes),
});
export type VoiceDispatchSchema = z.infer<typeof voiceDispatchSchema>;

export default defineAgent({
  entry: async (ctx) => {
    const metadata = voiceDispatchSchema.parse(JSON.parse(ctx.job.metadata));
    const rpc = async (method: string, payload: unknown) =>
      JSON.parse(
        await ctx.room.localParticipant!.performRpc({
          destinationIdentity: metadata.participantIdentity,
          method,
          payload: JSON.stringify(payload),
          responseTimeout:
            method === "codaloud.voice.action" ? 180_000 : 15_000,
        }),
      );
    let speechEnabled = metadata.speechEnabled;
    let spokenCharacters = 0;
    let chargedSpeechCredits = 0;
    let usageQueue = Promise.resolve();
    let creditFailure = false;
    const endForBilling = async (error: unknown) => {
      if (error instanceof InsufficientCreditsError) {
        creditFailure = true;
        await ctx.room.localParticipant
          ?.setAttributes({ "codaloud.voice.error": "credits" })
          .catch(() => {});
      }
      ctx.shutdown("Voice credits exhausted or billing unavailable");
    };
    const meter = (operation: () => Promise<unknown>) => {
      usageQueue = usageQueue.then(operation).then(() => {}, endForBilling);
    };
    const tts = new elevenlabs.TTS({
      apiKey: serverEnv.ELEVENLABS_API_KEY,
      voiceId: metadata.voiceId,
      model: "eleven_flash_v2_5",
      encoding: "pcm_22050",
    });
    tts.on("metrics_collected", (metrics) => {
      if (!speechEnabled || metrics.cancelled || metrics.charactersCount <= 0)
        return;
      spokenCharacters += metrics.charactersCount;
      const due = creditsForSpeech(spokenCharacters);
      while (chargedSpeechCredits < due) {
        const unit = chargedSpeechCredits++;
        meter(() =>
          chargeCredits(
            metadata.participantIdentity,
            `voice-tts:${ctx.job.id}:${unit}`,
            1,
            "Voice speech · 150 characters",
          ),
        );
      }
    });
    const session = new voice.AgentSession({
      stt: new deepgram.STT({
        apiKey: serverEnv.DEEPGRAM_API_KEY,
        model: "nova-3",
        language: "en",
        interimResults: true,
        endpointing: 500,
        utteranceEndMs: 1000,
      }),
      llm: new VoiceLanguageModel(
        ctx.room.name ?? ctx.job.id,
        async (instruction, id, title, requestId) => {
          try {
            const response = await ctx.room.localParticipant!.performRpc({
              destinationIdentity: metadata.participantIdentity,
              method: "codaloud.plan.propose",
              payload: JSON.stringify({ instruction, id, title, requestId }),
            });
            return JSON.parse(response);
          } catch {
            return {
              accepted: false,
              message:
                "Plan delivery could not be confirmed. Check the plan panel; no task has been started by this tool. Do not resubmit automatically.",
            };
          }
        },
        {
          // One capture per model turn; late speech events must not replace it.
          context: () => rpc("codaloud.voice.context", {}),
          rpc,
        },
        metadata.participantIdentity,
      ),
      tts,
      // Local Silero VAD is the Agents 1.9 default. No paid turn detector is used.
      turnHandling: {
        turnDetection: "manual",
        preemptiveGeneration: { enabled: false },
        interruption: {
          enabled: true,
          mode: "vad",
          // An interruption ends the old reply instead of pausing it to resume.
          resumeFalseInterruption: false,
        },
      },
      connOptions: {
        sttConnOptions: { maxRetry: 0 },
        llmConnOptions: { maxRetry: 0 },
        ttsConnOptions: { maxRetry: 0 },
        maxUnrecoverableErrors: 1,
      },
    });
    const completions: string[] = [];
    const reported = new Set<string>();
    const announce = () => {
      if (
        !completions.length ||
        session.agentState !== "listening" ||
        session.userState === "speaking"
      )
        return;
      const text = completions.shift()!;
      // The durable task already generated a short validated summary. Speak it
      // directly, without another model call for every completion or progress tick.
      try {
        session.say(text, { addToChatCtx: true, allowInterruptions: true });
      } catch {
        /* The session may be closing. Results remain in the task panel. */
      }
    };
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, announce);
    session.on(voice.AgentSessionEventTypes.UserStateChanged, announce);
    const timer = setTimeout(
      () => ctx.shutdown("Voice session time limit"),
      voiceSessionDurationMs,
    );
    let joinTimer: ReturnType<typeof setTimeout> | undefined;
    let minuteTimer: ReturnType<typeof setInterval> | undefined;
    ctx.addShutdownCallback(async () => {
      clearTimeout(timer);
      clearTimeout(joinTimer);
      clearInterval(minuteTimer);
      await usageQueue;
      await session.close();
    });
    session.on(voice.AgentSessionEventTypes.Error, () => {
      if (creditFailure) return;
      void ctx.room.localParticipant
        ?.setAttributes({ "codaloud.voice.error": "unavailable" })
        .catch(() => {})
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
    // RoomIO must create its sink even for a muted start. Disabling the
    // startup output removes it entirely, so later toggles cannot restore it.
    session.output.setAudioEnabled(metadata.speechEnabled);
    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        textEnabled: false,
        participantIdentity: metadata.participantIdentity,
      },
      outputOptions: {
        audioEnabled: true,
        transcriptionEnabled: true,
        syncTranscription: false,
      },
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
    ctx.room.localParticipant!.registerRpcMethod(
      "codaloud.voice.preferences",
      async (data) => {
        if (
          data.callerIdentity !== metadata.participantIdentity ||
          data.payload.length > 256
        )
          throw new Error("Unauthorized voice settings");
        const preferences = voicePreferencesSchema.parse(
          JSON.parse(data.payload),
        );
        speechEnabled = preferences.speechEnabled;
        session.output.setAudioEnabled(preferences.speechEnabled);
        tts.updateOptions({ voiceId: preferences.voiceId });
        return "ok";
      },
    );
    ctx.room.localParticipant!.registerRpcMethod(
      "codaloud.task.complete",
      async (data) => {
        if (
          data.callerIdentity !== metadata.participantIdentity ||
          data.payload.length > 6000
        )
          throw new Error("Unauthorized task completion");
        const result = z
          .object({
            id: z.string().max(256),
            summary: z.string().min(1).max(3000),
          })
          .parse(JSON.parse(data.payload));
        if (!reported.has(result.id)) {
          reported.add(result.id);
          completions.push(result.summary);
          announce();
        }
        return "ok";
      },
    );
    await ctx.room.localParticipant!.setAttributes({
      "codaloud.voice.ready": "true",
    });
    // A cancelled token request can allocate a room without delivering it to
    // the phone. Do not keep that abandoned worker alive for the full session.
    joinTimer = setTimeout(
      () => ctx.shutdown("Voice participant did not join"),
      30_000,
    );
    void ctx
      .waitForParticipant(metadata.participantIdentity)
      .then(async () => {
        clearTimeout(joinTimer);
        let minute = 0;
        const chargeMinute = async () => {
          await chargeCredits(
            metadata.participantIdentity,
            `voice-minute:${ctx.job.id}:${minute}`,
            3,
            `Voice connection · minute ${minute + 1}`,
          );
          minute++;
        };
        await chargeMinute();
        minuteTimer = setInterval(() => {
          meter(chargeMinute);
        }, 60_000);
      })
      .catch(async (error) => {
        if (error instanceof InsufficientCreditsError)
          await endForBilling(error);
        else ctx.shutdown("Voice participant unavailable");
      });
  },
});
