# iOS voice capture startup

Investigated on September 22, 2026, using the running iPhone 18 Pro Max simulator on iOS 27.0. Installed versions: Expo 57.0.23, React Native 0.86.3, `@livekit/react-native` 3.0.0, `@livekit/react-native-webrtc` 144.2.0, and `livekit-client` 2.22.3.

## Confirmed failure

The app can publish an enabled, unmuted, live microphone track while the native audio engine produces no samples. The existing terminal trace showed incoming audio packets but zero outbound microphone packets and bytes. Simulator logs at 08:51:56 showed the engine starting, then stopping as native audio configuration changed from playback to play-and-record.

This was reproduced without the voice worker, cloud services, or speech recognition: two local WebRTC peers negotiate playback first, then add a microphone track. A failing run stays connected with a live track, but `totalSamplesDuration`, `packetsSent`, and `bytesSent` remain zero throughout three measurements. Starting capture before playback succeeded. The default-policy reproduction was intermittent, including three failures in the first five playback-first trials.

The confirmed boundary is native audio initialization/reconfiguration, not a missing worker or delayed transcript. These measurements do not identify a particular internal WebRTC C++ defect, nor prove every reported voice failure has this cause.

## Change

`voice-audio.ts` installs a static native iOS policy that keeps the audio category `playAndRecord` during both playback and recording. It preserves the SDK's mixing, Bluetooth, AirPlay, speaker preference, and voice-processing-specific modes. This uses the SDK's native policy API, with no JavaScript callbacks on the audio engine thread.

Before activating the audio session or connecting the room, `voice-native.ts` now awaits explicit configuration of that category. Changing only the later engine policy still failed on the first run after a runtime reload; preparing the category before activation addressed that remaining reproduction.

The policy does not start microphone capture. Publication and muting still follow the existing authenticated control RPC and `setMicrophoneEnabled` calls, including stopping the microphone track on mute. Android retains SDK behavior: iOS policy/configuration calls are no-ops there.

## Native regression check

Start the existing iOS development build with Metro on port 8081, open a project, and stop any active voice conversation. Then run:

```sh
node scripts/diagnose-voice-capture.mjs --runs=5
node scripts/diagnose-voice-capture.mjs --sdk-default --runs=3
```

The script loads the app's voice modules through its development debugger and uses the production audio setup. It creates two local peer connections with no ICE servers; signaling stays in memory. It captures microphone audio briefly and may play it locally, but does not save audio, create a LiveKit room, or call transcription/AI providers. It stops its tracks, closes its peers, releases the audio session, and restores the application policy after each comparison run.

A successful check requires both microphone sample duration and outbound packet count to increase. This distinguishes a stalled recorder from ordinary silence. Any failed run gives the command a nonzero exit code. `--sdk-default` intentionally bypasses the fix to reproduce the original initialization policy; failures there are the comparison signal, not a regression in the application policy.

After the final change, five consecutive native trials passed, including the first after code reload. Reverting to the original SDK policy then reproduced the failure in one of three trials. Another explicit runtime reload followed by three application-policy trials also passed: eight successful native trials with the completed fix. The automated voice suite passed 103 tests across 15 files, and TypeScript passed. The added connection test verifies native configuration completes before audio activation and room connection can proceed.

After explicit user approval, a three-second cloud check used the production hold-mode connection and existing LiveKit/Deepgram path. The agent reached listening state. Microphone capture stopped after 3,002 milliseconds; by the last sample at 2,622 milliseconds, sample duration had advanced from zero to 2.61 seconds and outbound media reached 76 packets / 11,736 bytes. Audio energy was nonzero, remote-reported packet loss was zero, and no app-level errors occurred. The turn was cancelled without committing an instruction, the connection closed, and the native audio-session owner returned to inactive. Only counters and transcript metadata were collected by the diagnostic, not audio or transcript text.

No transcript events arrived during that brief window, so this verifies capture and cloud transport, not successful Deepgram transcription or generated responses. Physical iOS devices, Bluetooth routes, and Android hardware were not exercised in this investigation.

## References

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/): checked against the installed Expo/React Native versions.
- [LiveKit React Native setup](https://docs.livekit.io/transport/sdk-platforms/react-native/): registration and audio-session lifecycle.
- [LiveKit native audio management source](https://github.com/livekit/client-sdk-react-native/blob/main/src/audio/AudioManager.ts): static iOS policy and recording/playout defaults; checked against installed 3.0.0 source.
- Installed `@livekit/react-native/ios/LiveKitReactNativeModule.swift`: activation and explicit Apple audio configuration are separate native operations.
- Installed `@livekit/react-native-webrtc/ios/RCTWebRTC/AudioDeviceModuleObserver.m`: native configuration during engine enable/disable transitions.
