import type { LocalAudioTrack } from "livekit-client";

// A reference to the existing capture track, never another recorder or audio history.
let track: LocalAudioTrack | undefined;
const listeners = new Set<() => void>();
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
