import type {
  NativeLanguageAnalysis,
  NativeLanguageAnalyzer,
} from "./native-diagnostics";

const unavailable: NativeLanguageAnalysis = {
  status: "unavailable",
  diagnostics: [],
};

/** Answers with the richer analyzer once its runtime is up; while cold the fast
 * grammar answers and the boot runs in the background. */
export const createWarmPreferredAnalyzer = (
  preferred: NativeLanguageAnalyzer,
  fallback: NativeLanguageAnalyzer,
  runtime: { isReady: () => boolean; bootstrap: () => Promise<unknown> },
): NativeLanguageAnalyzer => {
  let disposed = false;
  return {
    analyze: async (content): Promise<NativeLanguageAnalysis> => {
      if (disposed) return unavailable;
      if (runtime.isReady()) {
        const rich = await preferred.analyze(content);
        if (disposed) return unavailable;
        if (rich.status === "ready") return rich;
        return fallback.analyze(content);
      }
      // The boot outlives this analyzer: a host that disposes its registry
      // after every request still keeps the runtime the first one paid for.
      void runtime.bootstrap().catch(() => {});
      return fallback.analyze(content);
    },
    dispose: () => {
      disposed = true;
      preferred.dispose();
      fallback.dispose();
    },
  };
};
