import { expect, it, vi } from "vitest";
import type { LocalAudioTrack } from "livekit-client";
import { microphoneTrack, voiceAudioSession } from "../voice-track";
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

it("waits for preview deactivation before handing audio to voice", async () => {
  let finish!: () => void;
  const release = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  voiceAudioSession.set(false);
  const releasing = voiceAudioSession.releasePreview(release);
  await Promise.resolve();
  const ready = vi.fn();
  const acquiring = voiceAudioSession.acquire().then(ready);
  expect(voiceAudioSession.getSnapshot()).toBe(true);
  expect(ready).not.toHaveBeenCalled();
  finish();
  await Promise.all([releasing, acquiring]);
  expect(ready).toHaveBeenCalledOnce();
  voiceAudioSession.set(false);
});

it("skips a queued preview shutdown if voice claims audio first", async () => {
  const release = vi.fn();
  voiceAudioSession.set(false);
  const releasing = voiceAudioSession.releasePreview(release);
  await voiceAudioSession.acquire();
  await releasing;
  expect(release).not.toHaveBeenCalled();
  voiceAudioSession.set(false);
});

it("does not leave audio ownership blocked after a failed preview cleanup", async () => {
  voiceAudioSession.set(false);
  await voiceAudioSession.releasePreview(async () => {
    throw new Error("inactive");
  });
  await voiceAudioSession.acquire();
  expect(voiceAudioSession.getSnapshot()).toBe(true);
  voiceAudioSession.set(false);
});
