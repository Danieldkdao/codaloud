import { getCurrentUser } from "@/lib/auth/helpers";
import { createCodeAnalyzerRegistry } from "@/features/code-intelligence/analyzer-registry";
import {
  remoteDiagnosticsRequestSchema,
  type RemoteDiagnosticsResultSchema,
} from "@/features/code-intelligence/diagnostics-schemas";
import { serverAnalyzerOptions } from "./analyzer-assets";

const failure = "Couldn’t analyze this file. Please try again.";
const reply = (message: string, status: number) =>
  Response.json(
    { message },
    { status, headers: { "Cache-Control": "no-store" } },
  );

// Matches the device's remote budget so a wedged runtime never outlives the
// client that asked for it.
const timeoutMs = 12000;

/** Hermes has no WebAssembly, so the wasm analyzers throw on device; running
 * them here also lets the editor and the agent read the same answer. */
export const handleDiagnosticsRequest = async (request: Request) => {
  try {
    const { userId } = await getCurrentUser(request.headers);
    if (!userId) return reply("Sign in to analyze code.", 401);
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 4 * 1024 * 1024)
        return reply("This file is too large to analyze.", 413);
      body = JSON.parse(text);
    } catch {
      return reply("Invalid diagnostics request.", 400);
    }
    const input = remoteDiagnosticsRequestSchema.safeParse(body);
    if (!input.success) return reply("This file cannot be analyzed.", 400);

    const analyzer = createCodeAnalyzerRegistry(
      input.data.path,
      // Only TypeScript and JavaScript reach the request callback, and those
      // are compiled on the device. Nothing to forward to from a Node host.
      async () => null,
      undefined,
      serverAnalyzerOptions(),
    );
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (request.signal.aborted) return reply("Request cancelled.", 499);
    request.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    let result: RemoteDiagnosticsResultSchema;
    try {
      const analysis = await analyzer.analyzeFile({
        path: input.data.path,
        content: input.data.content,
        revision: 1,
      });
      result =
        analysis.status === "ready"
          ? { status: "ready", diagnostics: analysis.diagnostics }
          : { status: analysis.status };
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
      analyzer.dispose();
    }
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return reply(failure, 503);
  }
};
