import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Platform, Pressable, Switch, View } from "react-native";
import type { AudioPlayer } from "expo-audio";
import { HeadingText, PText } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { voiceAudioSession } from "@/services/livekit/voice-track";
import { voicePresets } from "../constants";
import { useEditorPreferences } from "../hooks/use-editor-preferences";
import { SettingsSection } from "./settings-section";

const previewSource = (id: string) => {
  switch (id) {
    case "JBFqnCBsd6RMkjVDRZzb":
      return require("../../../../assets/voices/george.mp3");
    case "EXAVITQu4vr4xnSDxMaL":
      return require("../../../../assets/voices/sarah.mp3");
    case "IKne3meq5aSn9XLyUdCD":
      return require("../../../../assets/voices/charlie.mp3");
    case "SAz9YHcvj6GT2YYXdXww":
      return require("../../../../assets/voices/river.mp3");
    case "pFZP5JQG7iQjIQuC4Bku":
      return require("../../../../assets/voices/lily.mp3");
  }
};

export const VoiceSettings = ({ settings = false }: { settings?: boolean }) => {
  const { preferences, update } = useEditorPreferences();
  const primary = useThemeColor("primary");
  const border = useThemeColor("border");
  const player = useRef<AudioPlayer | null>(null);
  const deactivatePreview = useRef<(() => Promise<void>) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewVersion = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const inConversation = useSyncExternalStore(
    voiceAudioSession.subscribe,
    voiceAudioSession.getSnapshot,
  );
  const stopPreview = () => {
    previewVersion.current++;
    clearTimeout(timer.current);
    const previous = player.current;
    player.current = null;
    previous?.pause();
    previous?.remove();
    if (previous && deactivatePreview.current)
      void voiceAudioSession.releasePreview(deactivatePreview.current);
  };
  useEffect(() => {
    const unsubscribe = voiceAudioSession.subscribe(() => {
      if (voiceAudioSession.getSnapshot()) stopPreview();
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopPreview();
    });
    return () => {
      stopPreview();
      subscription.remove();
      unsubscribe();
    };
  }, []);
  const select = async (id: string) => {
    void update({ voiceId: id });
    stopPreview();
    setError(null);
    // A preview player must not take the audio session away from WebRTC.
    if (voiceAudioSession.getSnapshot()) return;
    const version = previewVersion.current;
    try {
      const { createAudioPlayer, setIsAudioActiveAsync } =
        await import("expo-audio");
      await voiceAudioSession.waitForPreviewCleanup();
      if (version !== previewVersion.current || voiceAudioSession.getSnapshot())
        return;
      // Bundled provider samples never call the synthesis API or consume credits.
      // Android's setter disables all future Expo playback until re-enabled;
      // only iOS needs this explicit release of the shared AVAudioSession.
      deactivatePreview.current =
        Platform.OS === "ios" ? () => setIsAudioActiveAsync(false) : null;
      // Expo's automatic completion cleanup runs later and cannot see WebRTC.
      // Release explicitly through the shared audio owner instead.
      player.current = createAudioPlayer(previewSource(id), {
        keepAudioSessionActive: true,
      });
      player.current.play();
      timer.current = setTimeout(stopPreview, 6000);
    } catch {
      if (
        version === previewVersion.current &&
        !voiceAudioSession.getSnapshot()
      ) {
        stopPreview();
        setError("Voice saved. The preview couldn’t play.");
      }
    }
  };
  const content = (
    <View className="gap-3 py-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-1">
          <PText className="text-lg font-medium text-foreground">
            Spoken responses
          </PText>
          <PText>
            Hear Codaloud’s replies. Transcripts stay visible when sound is off.
          </PText>
        </View>
        <Switch
          accessibilityLabel="Spoken responses"
          value={preferences.speechEnabled}
          trackColor={{ false: border, true: primary }}
          ios_backgroundColor={border}
          onValueChange={(speechEnabled) => {
            stopPreview();
            void update({ speechEnabled });
          }}
        />
      </View>
      {preferences.speechEnabled ? (
        <View accessibilityRole="radiogroup" className="gap-2">
          {voicePresets.map((voice) => (
            <Pressable
              key={voice.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: preferences.voiceId === voice.id }}
              accessibilityLabel={`${voice.name}, ${voice.description}`}
              onPress={() => {
                void select(voice.id);
              }}
              className={cn(
                "min-h-16 flex-row items-center gap-3 rounded-2xl border border-border p-3 active:opacity-60",
                !settings && "bg-background",
                preferences.voiceId === voice.id &&
                  "border-primary bg-primary/10",
              )}
            >
              <Icon
                family="Feather"
                name="volume-2"
                size={20}
                className="text-primary"
              />
              <View className="flex-1">
                <PText className="font-medium text-foreground">
                  {voice.name}
                </PText>
                <PText>{voice.description}</PText>
              </View>
              {preferences.voiceId === voice.id ? (
                <Icon
                  family="Feather"
                  name="check"
                  size={20}
                  className="text-primary"
                />
              ) : null}
            </Pressable>
          ))}
          <PText>
            {inConversation
              ? "Your selection applies to this conversation. Close it to preview voices."
              : "Select a voice to hear a short preview."}
          </PText>
        </View>
      ) : null}
      {error ? <PText className="text-destructive">{error}</PText> : null}
    </View>
  );
  return settings ? (
    <SettingsSection title="Voice">
      <View className="px-4">{content}</View>
    </SettingsSection>
  ) : (
    <View>
      <HeadingText className="text-xl font-semibold">Voice</HeadingText>
      {content}
    </View>
  );
};
