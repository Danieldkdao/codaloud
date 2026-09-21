import { AudioSession, registerGlobals } from "@livekit/react-native";
import { mediaDevices } from "@livekit/react-native-webrtc";
import { Room, RoomEvent, type RemoteParticipant } from "livekit-client";
import {
  createVoiceSession,
  deleteVoiceSession,
} from "@/features/voice/actions";
import { voiceAgentName, voiceControlMethod } from "@/features/voice/constants";
import type { ConnectVoice, VoiceConnection } from "@/features/voice/types";
import { createVoiceTranscriptReceiver } from "./voice-transcripts";

registerGlobals();

// Permission prompts and native audio setup cannot be aborted halfway through.
// Keep a single native audio owner, including teardown, across mounted screens.
let setupQueue = Promise.resolve();
export const connectNativeVoice: ConnectVoice = (mode, signal, events) => {
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
      const permission = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      permission.getTracks().forEach((track) => track.stop());
    } catch {
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
    let closing: Promise<void> | undefined;
    let controls = Promise.resolve();
    const request = new AbortController();
    const abort = () => {
      request.abort();
      void room.disconnect().catch(() => {});
    };
    signal.addEventListener("abort", abort);
    const timeout = setTimeout(() => request.abort(), 30_000);
    const close = () => {
      if (closing) return closing;
      closed = true;
      signal.removeEventListener("abort", abort);
      room.removeAllListeners();
      room.unregisterTextStreamHandler("lk.transcription");
      closing = (async () => {
        await room.disconnect().catch(() => {});
        await controls.catch(() => {});
        // A publish already in flight must finish before releasing native audio.
        await room.disconnect().catch(() => {});
        await AudioSession.stopAudioSession().catch(() => {});
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
          events.onError("A voice provider is unavailable. Please try again.");
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
      await AudioSession.startAudioSession();
      checkCancelled();
      await room.connect(credentials.serverUrl, credentials.token, {
        autoSubscribe: true,
      });
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
      return {
        close,
        control: (action) => {
          controls = controls.then(async () => {
            if (closed || signal.aborted) return;
            const enable = action === "start" || action === "hands-free";
            if (!enable)
              await room.localParticipant.setMicrophoneEnabled(false);
            if (closed || signal.aborted) return;
            await room.localParticipant.performRpc({
              destinationIdentity: agentIdentity!,
              method: voiceControlMethod,
              payload: JSON.stringify({ action }),
              responseTimeout: 5,
            });
            if (enable && !closed && !signal.aborted)
              await room.localParticipant.setMicrophoneEnabled(true, {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              });
          });
          return controls;
        },
      };
    } catch (error) {
      await close();
      throw error instanceof Error
        ? error
        : new Error("Voice could not connect. Try again.");
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
