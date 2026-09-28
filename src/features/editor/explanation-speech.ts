import { toSpeechSentences } from "./lib/formatters";

export type ExplanationSpeechOptions = {
  /** Mirrors the "Spoken responses" preference used by the voice agent. */
  readonly enabled: boolean;
  /** Turns one sentence into a playable audio source. */
  synthesize: (text: string) => Promise<string>;
  /** Plays a source and resolves when it finishes. */
  play: (source: string) => Promise<void>;
  /** Stops the active player immediately. */
  stopPlayback: () => void;
  /** Reports a sentence that could not be synthesized or played. */
  onError?: (error: unknown, sentence: string) => void;
};

/**
 * Speaks a streamed explanation one whole sentence at a time, queuing Markdown
 * deltas as they complete so speech never starts mid-word.
 */
export const createExplanationSpeech = (options: ExplanationSpeechOptions) => {
  let generation = 0;
  let release: (() => void) | null = null;

  const stop = () => {
    generation++;
    options.stopPlayback();
    release?.();
    release = null;
  };

  const speak = async (markdown: string) => {
    if (!options.enabled) return;
    const sentences = toSpeechSentences(markdown);
    if (!sentences.length) return;
    const run = generation;
    for (const sentence of sentences) {
      // A newer explanation, or a close, invalidates the rest of this one.
      if (run !== generation) return;
      try {
        const source = await options.synthesize(sentence);
        if (run !== generation) return;
        await new Promise<void>((resolve) => {
          release = resolve;
          options.play(source).then(resolve, resolve);
        });
        release = null;
      } catch (error) {
        // Report rather than swallow: a silent failure here is indistinguishable
        // from the feature being broken, which is exactly what it looks like.
        options.onError?.(error, sentence);
        if (run !== generation) return;
      }
    }
  };

  return { speak, stop };
};

export type ExplanationSpeech = ReturnType<typeof createExplanationSpeech>;
