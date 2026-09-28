import { useMultibandTrackVolume } from "@livekit/react-native";
import type { LocalAudioTrack } from "livekit-client";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";

const FrequencyBar = ({ value }: { value: number }) => {
  const style = useAnimatedStyle(() => ({
    height: withTiming(
      3 + Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 25,
      { duration: 80, reduceMotion: ReduceMotion.System },
    ),
  }));
  return (
    <Animated.View className="w-1.5 rounded-full bg-primary" style={style} />
  );
};

const VoiceFrequencyBars = ({ track }: { track: LocalAudioTrack }) => {
  const bands = useMultibandTrackVolume(track, {
    bands: 9,
    minFrequency: 100,
    maxFrequency: 8000,
    updateInterval: 60,
  });
  return (
    <View
      accessibilityLabel="Microphone frequency levels"
      className="h-8 flex-row items-center justify-center gap-1.5 mb-2"
    >
      {Array.from({ length: 9 }, (_, index) => (
        <FrequencyBar key={index} value={bands[index] ?? 0} />
      ))}
    </View>
  );
};

export default VoiceFrequencyBars;
