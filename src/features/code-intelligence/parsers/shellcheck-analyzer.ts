import {
  isAnalyzableContent,
  type NativeLanguageAnalysis,
  type NativeLanguageAnalyzer,
} from "./native-diagnostics";
import { createShellCheckSession } from "./shellcheck-session";
import {
  toShellCheckDiagnostics,
  type ShellCheckLintResult,
} from "./shellcheck-diagnostics";

// Resolve the vendored module and download it. The imports are dynamic so this
// module stays free of React Native, which lets tests drive the analyzer with
// their own bytes instead.
const loadShellCheckBytes = async () => {
  const [{ resolveNativeAssetUrl }, { loadWasmBytes }] = await Promise.all([
    import("./native-runtime"),
    import("./wasm-instance"),
  ]);
  // The wasm is vendored rather than imported because the package does not
  // expose it through its exports map.
  const url = resolveNativeAssetUrl(require("./runtimes/shellcheck.wasm"));
  if (!url) throw new Error("ShellCheck asset unavailable");
  return loadWasmBytes(url);
};

export const createShellCheckAnalyzer = (
  loadBytes: () => Promise<Uint8Array> = loadShellCheckBytes,
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
        // A rejected download must not be cached, or every later analysis would
        // replay the same failure. The session itself is never cached, so there
        // is no other poisoned state to clear.
        bytes = undefined;
        if (__DEV__)
          console.warn(
            `ShellCheck failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        return { status: "unavailable", diagnostics: [] };
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};
