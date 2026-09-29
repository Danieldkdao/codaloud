import { lazy, Suspense, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { microphoneTrack } from "@/services/livekit/voice-track";
import type { VoiceConversation } from "../hooks/use-voice-conversation";
import { inlineSession } from "../inline-session";

const VoiceFrequencyBars = lazy(() => import("./voice-frequency-bars"));

export const InlineVoiceControls = ({
  conversation,
}: {
  conversation: VoiceConversation;
}) => {
  const track = useSyncExternalStore(
    microphoneTrack.subscribe,
    microphoneTrack.getSnapshot,
  );
  const request = useSyncExternalStore(
    inlineSession.subscribe,
    inlineSession.getSnapshot,
  );
  const { state } = conversation;
  const waiting =
    request?.status === "generating" || request?.status === "applying";
  const recording = state.listening || state.connection === "connecting";
  const transcript =
    request?.transcript ||
    state.transcript.findLast((segment) => segment.role === "user")?.text;
  const error = request?.error || state.error || state.transcriptWarning;
  const quietWaveform = (
    <View
      accessibilityLabel="Microphone idle"
      className="h-8 flex-row items-center justify-center gap-1.5 mb-2"
    >
      {Array.from({ length: 9 }, (_, index) => (
        <View
          key={index}
          className="h-1 w-1.5 rounded-full bg-muted-foreground"
        />
      ))}
    </View>
  );
  return (
    <View
      testID="inline-voice-controls"
      className="flex-row items-center px-1 py-2"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          recording ? "Stop recording and send edit" : "Speak another edit"
        }
        accessibilityState={{ disabled: waiting }}
        disabled={waiting}
        onPress={recording ? conversation.pause : conversation.startInline}
        className="size-11 items-center justify-center rounded-full active:opacity-60 disabled:opacity-40"
      >
        <Icon
          family="Feather"
          name={recording ? "square" : "mic"}
          size={22}
          className="text-foreground"
        />
      </Pressable>
      <View className="min-w-0 flex-1 px-2">
        {track && state.listening ? (
          <Suspense fallback={quietWaveform}>
            <VoiceFrequencyBars track={track} />
          </Suspense>
        ) : (
          quietWaveform
        )}
        <PText
          numberOfLines={2}
          ellipsizeMode="tail"
          className="text-foreground"
        >
          {transcript ||
            (state.connection === "connecting"
              ? "Connecting…"
              : "Tap to speak or describe your edit…")}
        </PText>
        {error ? (
          <PText
            accessibilityRole="alert"
            numberOfLines={2}
            className="text-destructive"
          >
            {error}
          </PText>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close inline voice edit"
        onPress={conversation.stop}
        className="size-11 items-center justify-center rounded-full active:opacity-60"
      >
        <Icon
          family="Feather"
          name="x"
          size={22}
          className="text-muted-foreground"
        />
      </Pressable>
    </View>
  );
};
