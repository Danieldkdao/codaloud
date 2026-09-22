import {
  AudioSession,
  registerGlobals,
  setupIOSAudioManagement,
  type AppleAudioConfiguration,
} from "@livekit/react-native";

const duplex: AppleAudioConfiguration = {
  audioCategory: "playAndRecord",
  audioCategoryOptions: [
    "mixWithOthers",
    "allowBluetooth",
    "allowBluetoothA2DP",
    "allowAirPlay",
    "defaultToSpeaker",
  ],
  audioMode: "default",
};

export const configureVoiceAudio = () => {
  registerGlobals({ autoConfigureAudioSession: false });
  // The agent can start playout before microphone publication. Switching from
  // playback to playAndRecord then can leave iOS's engine stopped while the
  // published track stays live. Keep a duplex category for the whole session;
  // actual microphone capture still follows setMicrophoneEnabled.
  setupIOSAudioManagement(true, {
    playout: duplex,
    recording: { ...duplex, audioMode: "videoChat" },
    // Preserve media gain when Apple's voice processing is not active.
    recordingWithoutVoiceProcessing: duplex,
  });
};

export const prepareVoiceAudio = async () => {
  // Configure before activation, not only in the engine's later willEnable
  // callback: the first playout can otherwise initialize with the old category.
  await AudioSession.setAppleAudioConfiguration(duplex);
};
