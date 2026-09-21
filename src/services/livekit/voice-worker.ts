import { resolve } from "node:path";
import { cli, ServerOptions } from "@livekit/agents";
import { serverEnv } from "@/data/env/server";
import { voiceAgentName } from "@/features/voice/constants";

cli.runApp(
  new ServerOptions({
    agent: resolve("src/services/livekit/voice-agent.ts"),
    agentName: voiceAgentName,
    wsURL: serverEnv.LIVEKIT_URL,
    apiKey: serverEnv.LIVEKIT_API_KEY,
    apiSecret: serverEnv.LIVEKIT_API_SECRET,
  }),
);
