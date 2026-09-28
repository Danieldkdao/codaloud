import { fetch } from "expo/fetch";
import { Directory, File, Paths } from "expo-file-system";
import { authClient } from "@/lib/auth/auth-client";
import { getBaseURL } from "@/lib/auth/utils";
import { editorPreferencesStore } from "@/features/settings/hooks/use-editor-preferences";
import { voiceAudioSession } from "@/services/livekit/voice-track";
import type { ExplanationSpeech } from "./explanation-speech";
import { createExplanationSpeech } from "./explanation-speech";

/** Requests one sentence of audio. The API key never reaches the client. */
export const synthesizeSpeech = async (text: string) => {
  const voiceId = editorPreferencesStore.getSnapshot().preferences.voiceId;
  const cookie = await authClient.getCookie();
  const response = await fetch(
    `${getBaseURL().replace(/\/$/, "")}/api/editor/speak`,
    {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json", Cookie: cookie ?? "" },
      body: JSON.stringify({ text, voiceId }),
    },
  );
  if (!response.ok) throw new Error("Couldn’t synthesize this sentence.");
  // Cache by content so repeated sentences skip synthesis and reuse the file.
  const directory = new Directory(Paths.cache, "explanations");
  if (!directory.exists) directory.create({ intermediates: true });
  const file = new File(directory, `${hashText(text)}.wav`);
  file.write(await response.bytes());
  return file.uri;
};

const hashText = (text: string) => {
  let hash = 0;
  for (let index = 0; index < text.length; index++)
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return hash.toString(36);
};

/**
 * Plays synthesized audio without stealing the audio session from a live voice
 * conversation, matching how the voice previews coordinate with WebRTC.
 */
const playSpeech = async (uri: string) => {
  if (voiceAudioSession.getSnapshot()) return;
  const { createAudioPlayer } = await import("expo-audio");
  const player = createAudioPlayer({ uri }, { keepAudioSessionActive: true });
  // Nothing bounds playback indefinitely: a player that never loads or never
  // reports a terminal status must not stall the rest of the queue.
  const MAX_PLAYBACK_MS = 30_000;
  try {
    await new Promise<void>((resolve) => {
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let subscription: { remove: () => void } | undefined;

      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        subscription?.remove();
        resolve();
      };
      // The duration is only known once the file has loaded, so the early bound
      // is re-armed from each status update rather than read once up front.
      const armDeadline = (seconds: number) => {
        clearTimeout(deadline);
        if (!(seconds > 0)) return;
        deadline = setTimeout(
          settle,
          Math.min(seconds * 1000 + 500, MAX_PLAYBACK_MS),
        );
      };

      // Completion is detected by elapsed time, not a status event: Expo's player
      // never reports a terminal status for a local iOS file, so waiting would hang.
      subscription = player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) settle();
        else armDeadline(status.duration);
      });
      player.play();
      // The fallback bound also covers a player that reports no duration at all.
      armDeadline(MAX_PLAYBACK_MS / 1000);
    });
  } finally {
    player.pause();
    player.remove();
  }
};

let speech: ExplanationSpeech | null = null;

/** One shared player per app, so a new explanation stops the previous one. */
export const explanationSpeech = () => {
  if (!speech)
    speech = createExplanationSpeech({
      // Spoken responses is the same preference the voice agent honours, so one
      // switch silences every spoken answer in the app.
      get enabled() {
        return editorPreferencesStore.getSnapshot().preferences.speechEnabled;
      },
      synthesize: synthesizeSpeech,
      play: playSpeech,
      // A missing API key or a rejected request would otherwise look exactly
      // like the feature being off, so make it visible in the console.
      onError: (error) => {
        console.warn(
          "[explanation] Could not speak this sentence",
          error instanceof Error ? error.message : error,
        );
      },
    });
  return speech;
};
