import { expect, it, vi } from "vitest";
import type { LocalAudioTrack } from "livekit-client";
import { microphoneTrack } from "../voice-track";
it("publishes microphone replacements and clears the track on shutdown", () => {
  const listener = vi.fn();
  const unsubscribe = microphoneTrack.subscribe(listener);
  const track = {} as LocalAudioTrack;
  microphoneTrack.set(track);
  expect(microphoneTrack.getSnapshot()).toBe(track);
  microphoneTrack.set(track);
  expect(listener).toHaveBeenCalledTimes(1);
  microphoneTrack.set(undefined);
  expect(microphoneTrack.getSnapshot()).toBeUndefined();
  unsubscribe();
});
