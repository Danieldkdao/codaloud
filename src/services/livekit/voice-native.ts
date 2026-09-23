import { agentTasks } from "@/features/agent/task-runtime";
import { agentPlans } from "@/features/agent/plan-runtime";
import { editorPreferencesStore } from "@/features/settings/hooks/use-editor-preferences";
import {
  createVoiceSession,
  deleteVoiceSession,
} from "@/features/voice/actions";
import { voiceAgentName, voiceControlMethod } from "@/features/voice/constants";
import type { ConnectVoice, VoiceConnection } from "@/features/voice/types";
import { AudioSession } from "@livekit/react-native";
import { mediaDevices } from "@livekit/react-native-webrtc";
import { Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { z } from "zod";
import { configureVoiceAudio, prepareVoiceAudio } from "./voice-audio";
import { microphoneTrack, voiceAudioSession } from "./voice-track";
import { createVoiceTranscriptReceiver } from "./voice-transcripts";

configureVoiceAudio();

// Permission prompts and native audio setup cannot be aborted halfway through.
// Keep a single native audio owner, including teardown, across mounted screens.
let setupQueue = Promise.resolve();
export const connectNativeVoice: ConnectVoice = (
  mode,
  signal,
  events,
  options,
) => {
  let releaseAudio!: () => void;
  const audioReleased = new Promise<void>((resolve) => {
    releaseAudio = resolve;
  });
  const result = setupQueue.then(async (): Promise<VoiceConnection> => {
    const checkCancelled = () => {
      if (signal.aborted) throw new Error("Voice connection cancelled.");
    };
    checkCancelled();
    try {
      await voiceAudioSession.acquire();
      checkCancelled();
      const permission = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      permission.getTracks().forEach((track) => track.stop());
      checkCancelled();
    } catch {
      voiceAudioSession.set(false);
      checkCancelled();
      throw new Error(
        "Microphone permission is required. Enable it in Settings and try again.",
      );
    }
    checkCancelled();
    const room = new Room({
      disconnectOnPageLeave: false,
      publishDefaults: { stopMicTrackOnMute: true },
    });
    let roomName: string | undefined;
    let agentIdentity: string | undefined;
    let closed = false;
    let unsubscribeTasks: (() => void) | undefined;
    let unsubscribePreferences: (() => void) | undefined;
    let closing: Promise<void> | undefined;
    let connecting = false;
    let disconnecting: Promise<void> | undefined;
    const disconnect = () =>
      (disconnecting ??= room.disconnect().catch(() => {}));
    let controls = Promise.resolve();
    const request = new AbortController();
    const abort = () => {
      request.abort();
      // A pending connect needs cancellation immediately. Once connected,
      // close owns teardown so it can drain any microphone publication first.
      if (connecting) void disconnect();
    };
    signal.addEventListener("abort", abort);
    const timeout = setTimeout(() => request.abort(), 30_000);
    const close = () => {
      if (closing) return closing;
      closed = true;
      unsubscribePreferences?.();
      unsubscribeTasks?.();
      microphoneTrack.set(undefined);
      signal.removeEventListener("abort", abort);
      room.removeAllListeners();
      room.unregisterTextStreamHandler("lk.transcription");
      closing = (async () => {
        await controls.catch(() => {});
        // A publish already in flight must finish before releasing native audio.
        await disconnect();
        await AudioSession.stopAudioSession().catch(() => {});
        voiceAudioSession.set(false);
        if (roomName) await deleteVoiceSession(roomName);
      })().finally(releaseAudio);
      return closing;
    };
    const inspectAgent = () => {
      for (const participant of room.remoteParticipants.values()) {
        if (participant.attributes["codaloud.voice.ready"] === "true")
          agentIdentity = participant.identity;
        if (participant.identity !== agentIdentity) continue;
        if (participant.attributes["codaloud.voice.error"])
          events.onError("Failed to generate response. Please try again.");
        const state = participant.attributes["lk.agent.state"];
        if (
          state === "listening" ||
          state === "thinking" ||
          state === "speaking"
        )
          events.onAgentState(state);
      }
    };
    room.on(RoomEvent.ParticipantAttributesChanged, inspectAgent);
    room.on(RoomEvent.ParticipantConnected, inspectAgent);
    room.on(
      RoomEvent.ParticipantDisconnected,
      (participant: RemoteParticipant) => {
        if (!closed && participant.identity === agentIdentity)
          events.onError("The voice session ended. Start a new conversation.");
      },
    );
    room.on(RoomEvent.Disconnected, () => {
      if (!closed && !signal.aborted)
        events.onError("Voice disconnected. Please try again.");
    });
    try {
      const credentials = await createVoiceSession(mode, request.signal);
      if (!credentials)
        throw new Error(
          "Voice could not connect. Check your connection and try again.",
        );
      roomName = credentials.roomName;
      checkCancelled();
      room.registerRpcMethod("codaloud.plan.propose", async (data) => {
        if (
          !agentIdentity ||
          data.callerIdentity !== agentIdentity ||
          !options?.projectId ||
          data.payload.length > 6000
        )
          throw new Error("Workspace unavailable.");
        const input = z
          .object({
            instruction: z.string().trim().min(1).max(3000),
            title: z.string().trim().min(1).max(80),
            id: z.string().min(1).max(256),
          })
          .parse(JSON.parse(data.payload));
        return JSON.stringify(
          await agentPlans.propose(
            options.projectId,
            input.instruction,
            `${roomName}:${input.id}`,
            input.title,
          ),
        );
      });
      const receive = createVoiceTranscriptReceiver(
        credentials.participantIdentity,
        events.onSegment,
      );
      room.registerTextStreamHandler(
        "lk.transcription",
        (reader, participant) => {
          void receive(reader, participant).catch(() => {
            if (!closed && !signal.aborted)
              events.onError(
                "Transcript connection was interrupted. Please try again.",
              );
          });
        },
      );
      await prepareVoiceAudio();
      checkCancelled();
      await AudioSession.startAudioSession();
      checkCancelled();
      connecting = true;
      try {
        await room.connect(credentials.serverUrl, credentials.token, {
          autoSubscribe: true,
        });
      } finally {
        connecting = false;
      }
      checkCancelled();
      inspectAgent();
      if (!agentIdentity)
        await new Promise<void>((resolve, reject) => {
          const ready = () => {
            inspectAgent();
            if (agentIdentity) {
              cleanup();
              resolve();
            }
          };
          const cancelled = () => {
            cleanup();
            reject(new Error("Voice connection cancelled."));
          };
          const timer = setTimeout(() => {
            console.warn(
              `[voice] Room connected, but agent readiness timed out. Check that the ${voiceAgentName} worker is running and registered in the same LiveKit project as the API.`,
            );
            cleanup();
            reject(
              new Error(
                "The voice room connected, but the agent did not start. The voice service may be offline. Please try again shortly.",
              ),
            );
          }, 20_000);
          const cleanup = () => {
            clearTimeout(timer);
            room.off(RoomEvent.ParticipantAttributesChanged, ready);
            room.off(RoomEvent.ParticipantConnected, ready);
            signal.removeEventListener("abort", cancelled);
          };
          room.on(RoomEvent.ParticipantAttributesChanged, ready);
          room.on(RoomEvent.ParticipantConnected, ready);
          signal.addEventListener("abort", cancelled);
          if (signal.aborted) cancelled();
          else ready();
        });
      checkCancelled();
      let lastPreferences = "";
      const syncPreferences = () => {
        const { speechEnabled, voiceId } =
          editorPreferencesStore.getSnapshot().preferences;
        const payload = JSON.stringify({ speechEnabled, voiceId });
        // Unsubscribe immediately when muted, including speech already buffered.
        for (const participant of room.remoteParticipants.values())
          for (const publication of participant.audioTrackPublications.values())
            publication.setSubscribed(speechEnabled);
        if (payload === lastPreferences) return;
        lastPreferences = payload;
        controls = controls
          .catch(() => {})
          .then(async () => {
            if (closed || signal.aborted) return;
            await room.localParticipant.performRpc({
              destinationIdentity: agentIdentity!,
              method: "codaloud.voice.preferences",
              payload,
            });
          });
        void controls.catch(() => {
          if (!closed && !signal.aborted)
            events.onError("Couldn’t update voice settings. Please reconnect.");
        });
      };
      unsubscribePreferences =
        editorPreferencesStore.subscribe(syncPreferences);
      room.on(RoomEvent.TrackPublished, syncPreferences);
      syncPreferences();
      const announced = new Set<string>();
      const existing = new Set(
        agentTasks.getSnapshot().map((record) => record.event.id),
      );
      const announceTasks = () => {
        for (const record of agentTasks.getSnapshot()) {
          if (
            record.request.projectId !== options?.projectId ||
            existing.has(record.event.id) ||
            announced.has(record.event.id) ||
            !["completed", "failed"].includes(record.event.status) ||
            !record.event.summary
          )
            continue;
          announced.add(record.event.id);
          void room.localParticipant
            .performRpc({
              destinationIdentity: agentIdentity!,
              method: "codaloud.task.complete",
              payload: JSON.stringify({
                id: record.event.id,
                summary: record.event.summary,
              }),
            })
            .catch(() => {
              announced.delete(record.event.id);
            });
        }
      };
      unsubscribeTasks = agentTasks.subscribe(announceTasks);
      return {
        close,
        control: (action) => {
          controls = controls.then(async () => {
            if (closed || signal.aborted) return;
            const enable = action === "start" || action === "hands-free";
            if (!enable) {
              microphoneTrack.set(undefined);
              await room.localParticipant.setMicrophoneEnabled(false);
            }
            if (closed || signal.aborted) return;
            await room.localParticipant.performRpc({
              destinationIdentity: agentIdentity!,
              method: voiceControlMethod,
              payload: JSON.stringify({ action }),
              // Keep the SDK's 15-second default. JS RPC timeouts use milliseconds.
            });
            if (enable && !closed && !signal.aborted) {
              await room.localParticipant.setMicrophoneEnabled(true, {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              });
              if (!closed && !signal.aborted)
                microphoneTrack.set(
                  room.localParticipant.getTrackPublication(
                    Track.Source.Microphone,
                  )?.audioTrack,
                );
            }
          });
          return controls;
        },
      };
    } catch (error) {
      const failure =
        error instanceof Error
          ? error
          : new Error("Voice could not connect. Try again.");
      // Show startup failures before teardown: deleting the server room can
      // stall independently of the native connection. Keep teardown serialized
      // so a retry cannot acquire the microphone before this owner releases it.
      if (!signal.aborted) events.onError(failure.message);
      await close();
      throw failure;
    } finally {
      clearTimeout(timeout);
    }
  });
  setupQueue = result.then(
    () => audioReleased,
    () => {},
  );
  return result;
};
