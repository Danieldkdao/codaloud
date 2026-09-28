import type { LocalAudioTrack } from "livekit-client";

// A reference to the existing capture track, never another recorder or audio history.
let track: LocalAudioTrack | undefined;
const listeners = new Set<() => void>();
let audioActive = false;
let previewCleanup = Promise.resolve();
const audioListeners = new Set<() => void>();
export const voiceAudioSession = {
  getSnapshot: () => audioActive,
  set: (active: boolean) => {
    audioActive = active;
    audioListeners.forEach((listener) => listener());
  },
  acquire: async () => {
    // Stop previews synchronously, then drain any native deactivation already
    // in flight before WebRTC opens the microphone or activates its session.
    voiceAudioSession.set(true);
    await previewCleanup;
  },
  waitForPreviewCleanup: () => previewCleanup,
  releasePreview: (deactivate: () => Promise<void>) => {
    previewCleanup = previewCleanup
      .then(async () => {
        if (!audioActive) await deactivate();
      })
      .catch(() => {});
    return previewCleanup;
  },
  subscribe: (listener: () => void) => {
    audioListeners.add(listener);
    return () => {
      audioListeners.delete(listener);
    };
  },
};
export const microphoneTrack = {
  getSnapshot: () => track,
  set: (next: LocalAudioTrack | undefined) => {
    if (track === next) return;
    track = next;
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
