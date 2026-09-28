import {
  isAnalyzableContent,
  type NativeLanguageAnalysis,
  type NativeLanguageAnalyzer,
} from "./native-diagnostics";
import { createShellCheckSession } from "./shellcheck-session";
import { warnAnalyzerFailure } from "./analyzer-diagnostics-log";
import {
  toShellCheckDiagnostics,
  type ShellCheckLintResult,
} from "./shellcheck-diagnostics";

/**
 * Builds an analyzer that reads the runtime through the host's loader, because a
 * Node import here would break the native build.
 */
export const createShellCheckAnalyzer = (
  loadBytes: () => Promise<Uint8Array>,
): NativeLanguageAnalyzer => {
  let disposed = false;
  // Only the bytes are cached across analyses, never the instantiated module.
  // See createShellCheckSession for why an instance cannot be reused.
  let bytes: Promise<Uint8Array> | undefined;
  let sessionPromise:
    Promise<Awaited<ReturnType<typeof createShellCheckSession>>> | undefined;
  return {
    analyze: async (content): Promise<NativeLanguageAnalysis> => {
      if (disposed || !isAnalyzableContent(content))
        return { status: "unavailable", diagnostics: [] };
      try {
        const session = await createShellCheckSession(
          await (bytes ??= loadBytes()),
        );
        if (disposed) return { status: "unavailable", diagnostics: [] };
        const parsed = JSON.parse(await session.lint(content)) as
          ShellCheckLintResult[] | { error: string };
        if (!Array.isArray(parsed))
          return { status: "unavailable", diagnostics: [] };
        return {
          status: "ready",
          diagnostics: toShellCheckDiagnostics(content, parsed),
        };
      } catch (error) {
        // A rejected download must not stay cached, or every later analysis would
        // replay the same failure.
        bytes = undefined;
        warnAnalyzerFailure("ShellCheck failed", error);
        return { status: "unavailable", diagnostics: [] };
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};
