import { resolve } from "node:path";
import { cli, ServerOptions } from "@livekit/agents";
import { serverEnv } from "@/data/env/server";
import { voiceAgentName } from "@/features/voice/constants";
import { setDiagnosticsAnalyzerOptions } from "@/features/agent/lib/file-diagnostics";
import {
  loadWorkerWasmBytes,
  resolveWorkerAssetLocation,
} from "./worker-wasm-loader";

// The agent's tools analyze files in-process, so the worker supplies the wasm
// readers the app's bundled copy cannot import; the app keeps the registry's own.
setDiagnosticsAnalyzerOptions({
  loadWasmBytes: loadWorkerWasmBytes,
  resolveAssetLocation: resolveWorkerAssetLocation,
});

cli.runApp(
  new ServerOptions({
    agent: resolve("src/services/livekit/voice-agent.ts"),
    agentName: voiceAgentName,
    // LiveKit's `start` mode otherwise takes Metro's default port 8081.
    // Use a nonzero port: Agents 1.9 treats 0 as an unset production default.
    port: 8089,
    wsURL: serverEnv.LIVEKIT_URL,
    apiKey: serverEnv.LIVEKIT_API_KEY,
    apiSecret: serverEnv.LIVEKIT_API_SECRET,
  }),
);
