// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExplanationSpeech,
  type ExplanationSpeechOptions,
} from "@/features/editor/explanation-speech";
import {
  toSpeakableText,
  toSpeechSentences,
} from "@/features/editor/lib/formatters";

describe("toSpeakableText", () => {
  it("strips markdown decoration that would otherwise be read aloud", () => {
    expect(
      toSpeakableText("**Bold** and `code` and [a link](https://x.dev)."),
    ).toBe("Bold and code and a link.");
  });

  it("keeps list text but drops bullet markers", () => {
    expect(toSpeakableText("- first item\n- second item")).toBe(
      "first item second item",
    );
  });

  it("removes fenced code blocks, which are not prose", () => {
    expect(
      toSpeakableText("Intro.\n\n```ts\nconst a = 1;\n```\n\nOutro."),
    ).toBe("Intro. Outro.");
  });

  it("drops heading and emphasis markers", () => {
    expect(toSpeakableText("## Summary\nIt _works_.")).toBe(
      "Summary It works.",
    );
  });

  it("returns an empty string when nothing is speakable", () => {
    expect(toSpeakableText("```\ncode only\n```")).toBe("");
    expect(toSpeakableText("   ")).toBe("");
  });

  it("splits prose into whole sentences that keep their punctuation", () => {
    expect(toSpeechSentences("One thing. Two things! Three?")).toEqual([
      "One thing.",
      "Two things!",
      "Three?",
    ]);
  });

  it("splits an unpunctuated wall of text into capped chunks", () => {
    const sentences = toSpeechSentences("word ".repeat(400));
    expect(sentences.length).toBeGreaterThan(1);
    expect(sentences.every((sentence) => sentence.length <= 300)).toBe(true);
  });
});

describe("explanation speech", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("speaks queued sentences in order and waits for playback", async () => {
    const { options, synthesized, played } = options_();
    const speech = createExplanationSpeech(options);
    const running = speech.speak("First one. Second one. Third one.");
    await vi.waitFor(() => expect(played).toHaveLength(1));
    expect(played[0]).toBe("First one..wav");
    speech.stop();
    await running;
    expect(synthesized[0]).toBe("First one.");
  });

  it("does nothing when speech is disabled", async () => {
    const { options, synthesized, played } = options_();
    const speech = createExplanationSpeech({ ...options, enabled: false });
    await speech.speak("Anything at all.");
    expect(synthesized).toHaveLength(0);
    expect(played).toHaveLength(0);
    speech.stop();
  });

  it("skips a chunk with no speakable text", async () => {
    const { options, synthesized } = options_();
    const speech = createExplanationSpeech(options);
    const running = speech.speak("```\nconst a = 1;\n```");
    speech.stop();
    await running;
    expect(synthesized).toHaveLength(0);
  });

  it("stops pending speech when a new explanation supersedes it", async () => {
    const { options, synthesized, played } = options_();
    const speech = createExplanationSpeech(options);
    const running = speech.speak("First sentence. Second sentence.");
    await vi.waitFor(() => expect(played).toHaveLength(1));
    // Stopping must not let the queued remainder leak into playback.
    speech.stop();
    await running;
    expect(synthesized).toHaveLength(1);
    expect(played).toHaveLength(1);
  });

  it("keeps going when synthesis fails for one sentence", async () => {
    const { options, played } = options_();
    let first = true;
    const speech = createExplanationSpeech({
      ...options,
      synthesize: async (text) => {
        if (first) {
          first = false;
          throw new Error("voice unavailable");
        }
        return `${text}.wav`;
      },
    });
    const running = speech.speak("Broken one. Working one.");
    await vi.waitFor(() => expect(played).toHaveLength(1));
    expect(played[0]).toBe("Working one..wav");
    speech.stop();
    await running;
  });

  it("caps very long chunks so a wall of text still starts speaking", async () => {
    const { options, synthesized } = options_();
    const speech = createExplanationSpeech(options);
    const running = speech.speak("word ".repeat(400));
    await vi.waitFor(() => expect(synthesized.length).toBeGreaterThan(0));
    speech.stop();
    await running;
    expect(synthesized[0]!.length).toBeLessThanOrEqual(300);
  });
});

// Shorthand so the factory above stays readable.
const options_ = () => {
  const synthesized: string[] = [];
  const played: string[] = [];
  let release: (() => void) | null = null;
  return {
    synthesized,
    played,
    options: {
      enabled: true,
      synthesize: async (text: string) => {
        synthesized.push(text);
        return `${text}.wav`;
      },
      play: (source: string) => {
        played.push(source);
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    } satisfies ExplanationSpeechOptions,
    finish: () => release?.(),
  };
};
