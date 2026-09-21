# Voice runtime integration

Verified on 2026-09-21 using official LiveKit documentation, npm metadata, the published Agents 1.9.0 source archive, and installed package declarations. No provider inference, transcription, or synthesis requests were made.

## Runtime packages and deployment

`@livekit/agents`, `@livekit/agents-plugin-deepgram`, and `@livekit/agents-plugin-elevenlabs` latest stable versions are all `1.9.0`. Both plugins require that exact Agents version and `@livekit/rtc-node: ^0.13.34`. The worker runs as a persistent Node process independently of Expo API routes. Its API credentials come from typed server environment exports. [Agents registry](https://registry.npmjs.org/@livekit%2fagents/latest), [Deepgram registry](https://registry.npmjs.org/@livekit%2fagents-plugin-deepgram/latest), [ElevenLabs registry](https://registry.npmjs.org/@livekit%2fagents-plugin-elevenlabs/latest).

Current entry points are `defineAgent`, `ServerOptions`, and `cli.runApp`. `WorkerOptions` is a deprecated alias. The default export is `defineAgent({ entry: async (ctx: JobContext) => { ... } })`. Start a session with `await session.start({ agent, room: ctx.room, record: false })`, then `await ctx.connect()`. Start the executable with `cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName, wsURL, apiKey, apiSecret }))`. A named agent requires explicit dispatch; the token API and worker must use the same agent name. [Official quickstart](https://docs.livekit.io/agents/start/voice-ai/), [published worker source](https://github.com/livekit/agents-js/blob/main/agents/src/worker.ts).

## Speech provider adapters

The LiveKit plugins implement the `AgentSession` STT/TTS interfaces. Direct Deepgram and ElevenLabs SDK clients are not substitutes for those plugins.

- Nova streaming recognition: `new deepgram.STT({ apiKey, model: 'nova-3', language: 'en', interimResults: true, endpointing: 500, utteranceEndMs: 1000 })`. Nova uses `keyterm: string[]`.
- Flux conversational recognition: `new deepgram.STTv2({ apiKey, model: 'flux-general-en', eotThreshold: 0.7, eotTimeoutMs: 1000 })`. Flux uses `keyterms: string[]`. Omit `eagerEotThreshold` when speculative model calls are unwanted.
- ElevenLabs synthesis: `new elevenlabs.TTS({ apiKey, voiceId, model: 'eleven_flash_v2_5', encoding: 'pcm_22050' })`. The installed 1.9 Node plugin supports this PCM format; `pcm_24000` is absent from its `TTSEncoding` union. Set optional `ELEVENLABS_VOICE_ID` to a voice available to the account, or use the plugin default `bIHbv24MWmeRgasZH58o`. Pass the key explicitly because the plugin's environment convention is `ELEVEN_API_KEY`, whereas Codaloud uses its typed environment export.

Flux supplies semantic end-of-turn events; Nova supplies acoustic endpointing and final speech segments. `utteranceEndMs` below 1000 is not useful because interim result cadence constrains it. ElevenLabs' own-key plugin remains supported; LiveKit Inference retired ElevenLabs models on August 31, 2026. [Deepgram guide](https://docs.livekit.io/agents/models/stt/deepgram/), [ElevenLabs guide](https://docs.livekit.io/agents/models/tts/elevenlabs/).

## Explicit turn and interruption control

Create the session with `turnHandling: { turnDetection: 'manual', preemptiveGeneration: { enabled: false }, interruption: { enabled: true, mode: 'vad' } }`. Agents 1.9 enables preemptive generation by default, so disabling it must be explicit. The session supplies a bundled Silero VAD; selecting `mode: 'vad'` avoids selecting adaptive inference implicitly. Millisecond settings use milliseconds in the Node SDK. [Published turn options](https://github.com/livekit/agents-js/tree/main/agents/src/voice/turn_config).

Authenticated participant RPC handlers control the same session:

| Intent | Worker calls |
| --- | --- |
| Start held turn | `session.interrupt()`, `session.clearUserTurn()`, `session.updateOptions({ turnHandling: { turnDetection: 'manual' } })`, `session.input.setAudioEnabled(true)` |
| Release held turn | `session.input.setAudioEnabled(false)`, `session.commitUserTurn()` |
| Start hands-free | `session.updateOptions({ turnHandling: { turnDetection: 'stt' } })`, `session.input.setAudioEnabled(true)` |
| Cancel or stop | `session.input.setAudioEnabled(false)`, `session.clearUserTurn()`, `session.interrupt()` |

Use `ctx.room.localParticipant.registerRpcMethod(name, async (data) => ...)` and validate `data.callerIdentity` against the session owner. Node `commitUserTurn()` returns no transcript. Ignore blank committed turns with `onUserTurnCompleted` and `throw new voice.StopResponse()`. [Turn control guide](https://docs.livekit.io/agents/logic/turns/), [session update API source](https://github.com/livekit/agents-js/blob/main/agents/src/voice/agent_session.ts).

## AI SDK bridge

Use the existing `openrouter` provider with `streamText` from `ai`. Supply a small adapter extending `llm.LLM` and `llm.LLMStream`, so an additional OpenAI or OpenRouter LiveKit plugin is unnecessary. Convert only text user and assistant chat messages into AI SDK model messages, pass Codaloud instructions separately, bound retained context and generated tokens, and supply no tools. Call the model once per committed user turn. [OpenRouter AI SDK integration](https://openrouter.ai/docs/guides/community/vercel-ai-sdk), [published LLM adapter interfaces](https://github.com/livekit/agents-js/blob/main/agents/src/llm/llm.ts).

LiveKit documents custom `llmNode` hooks, but the published 1.9 pipeline schedules standard replies only when the configured model is an `llm.LLM` instance. Overriding the node while omitting the model silently skips that path. The adapter should implement `label()`, `model`, `provider`, and `chat(options)` returning its `llm.LLMStream`. Its stream constructor calls `super(model, { chatCtx, toolCtx, connOptions })`; `run()` feeds `{ id, delta: { role: 'assistant', content } }` into `this.queue.put`. [Pipeline hooks](https://docs.livekit.io/agents/logic/nodes/), [published reply scheduling](https://github.com/livekit/agents-js/blob/main/agents/src/voice/agent_activity.ts).

Cancellation needs deliberate wiring: the `LLMStream` base exposes protected `abortController`, and `close()` aborts it. Forward its signal directly into AI SDK `streamText({ abortSignal })`. Handle expected aborts quietly. An async generator's `finally` alone can remain blocked behind a pending provider read. The bridge uses `maxRetries: 0`, `maxOutputTokens: 512`, and an abort signal combined with a 45-second deadline. Disable the outer LiveKit retry layer with `connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 }` too. [Published generation source](https://github.com/livekit/agents-js/blob/main/agents/src/voice/generation.ts), [AI SDK streaming reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text).

The model is `openrouter/free`, the free-only router. It selects an available free model, so responses can vary and free-tier rate limits still apply. There is no paid-model fallback. Each committed, nonblank turn sends at most 12 recent messages, each capped at 4,000 characters, plus the fixed voice instructions. Partial Deepgram transcripts update the UI without invoking the model. [Free router](https://openrouter.ai/openrouter/free).

## Transcript delivery

RoomIO automatically forwards user interim/final transcripts and assistant text on `lk.transcription` with `transcriptionEnabled: true`. Header attributes include `lk.segment_id`, `lk.transcription_final`, and `lk.transcribed_track_id`. `senderIdentity` identifies the user or agent.

User segments are snapshots: each new stream for a segment replaces its preceding text. Assistant segments are deltas inside a single stream: accumulate chunks and finalize on stream closure. The Node transport cannot change the assistant stream's final header attribute on close, so do not wait exclusively for `lk.transcription_final: 'true'`. Native clients can consume these with `room.registerTextStreamHandler('lk.transcription', (reader, participantInfo) => ...)`.

`outputOptions.syncTranscription` defaults to true, aligning agent words with playback. False forwards text as soon as generation makes it available. Keep transcript UI state ephemeral and bounded; explicitly set `record: false` on session startup to avoid implicit session recording. [Text/transcription guide](https://docs.livekit.io/agents/multimodality/text/), [RoomIO output source](https://github.com/livekit/agents-js/blob/main/agents/src/voice/room_io/_output.ts), [RoomIO source](https://github.com/livekit/agents-js/blob/main/agents/src/voice/room_io/room_io.ts).

## Offline verification boundaries

Test gesture intent, RPC ownership, turn commitment, transcript replacement, streaming cancellation, reconnect cleanup, and bounded context with fake transports. Typecheck worker APIs against installed 1.9 declarations. Do not start a connected worker or call paid providers during automated verification. Live device permission behavior, audio routing, endpointing latency, free-model availability, and ElevenLabs voice entitlement need the user's manual demo.

## Native runtime

Pinned native packages: `@livekit/react-native@3.0.0`, `@livekit/react-native-webrtc@144.2.0`, `livekit-client@2.22.3`, `@livekit/react-native-expo-plugin@1.0.2`, and `@config-plugins/react-native-webrtc@15.0.2`. These match the React Native SDK's published WebRTC and LiveKit client peer ranges. Worker RTC is separately pinned to `@livekit/rtc-node@0.13.35`, matching Agents 1.9's `^0.13.34` range; RTC 1.x is not compatible with that peer requirement. The existing AI integration uses `ai@7.0.107` with `@openrouter/ai-sdk-provider@3.1.0`. [Expo integration](https://docs.livekit.io/transport/sdk-platforms/expo/), [React Native SDK](https://github.com/livekit/client-sdk-react-native).

The microphone runtime loads on activation, then calls `registerGlobals()` before creating the room. This also allows Expo to discover routes for the mobile API export without loading WebRTC native views on the server. Microphone permission is acquired before allocating a room. Audio ownership is serialized across room setup and teardown, and muted microphone tracks stop their underlying capture. The client waits for the dispatched agent's readiness attribute before publishing microphone audio, and controls are authorized by participant identity. A dispatched worker exits after 30 seconds if its owner never joins.

The transcript bubble uses the shared `GlassSurface`: native glass where supported, a readable themed surface elsewhere, and reduced-transparency/motion support. Its scroll viewport is capped at 240 points or 28% of screen height. Its container is inside the dock's touch bounds; only the control row contributes to editor bottom padding. The latest 60 segments remain in memory, with no transcript persistence. [Expo 57 glass API](https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/), [native touch bounds](https://reactnative.dev/docs/0.86/pressable).

## Run the demo

1. Apply the added native plugins and rebuild the development app: `pnpm exec expo prebuild`, then `pnpm ios` or `pnpm android`. Expo Go cannot load the WebRTC native module. An existing native development binary needs rebuilding.
2. Run `pnpm dev` from the repository root. It starts the Expo API/Metro server and the persistent voice worker together. The worker loads `.env` and uses the supported `start` command. Wait for its registration log before using the microphone. If either service exits, the launcher stops the other service; Ctrl+C stops both. `pnpm dev:app` starts only Expo for development that does not need local voice.
3. The worker must register as `codaloud-voice` in the same LiveKit project as the API. The app's configured API base URL must reach the Expo API server or a deployed API export containing `/api/voice/session`. If Metro is already running through `pnpm ios`, `pnpm android`, or `pnpm start`, run `pnpm voice:dev` in a separate terminal instead of starting a second Metro server. `pnpm voice:start` uses environment variables supplied by the host. These commands do not deploy a worker automatically.
4. Sign in and open a project's Code screen. Hold the microphone until connected, speak, then release. The transcript and spoken reply stream back. Hold again for another turn in the same conversation. Double-tap for hands-free; tap again or close the bubble to stop. A single tap shows instructions. Closing, changing screens, hiding the dock, or backgrounding the app ends the session. Sessions have a ten-minute limit.
5. Confirm permission denial/retry, quick release during connection, interruption, headset/speaker playback, transcript scrolling and “Jump to latest” on each native platform. Automated verification uses no provider inference, STT, or TTS requests; the live demo uses the configured providers' normal credits and quotas.

The worker uses Node 22+ and a supported native RTC/local-inference platform. The bundled local Silero VAD loads offline; no separate Silero plugin or paid turn detector is needed. No project context, tools, file modifications, or web search is attached to this conversation.

## Agent startup diagnostics

Expo/Metro uses port **8081**. The voice worker's HTTP health server uses **8089**; it does not serve the mobile app or its JavaScript bundle. The worker needs this explicit nonzero port because LiveKit's `start` mode defaults to 8081 and Agents 1.9 replaces a port value of 0 with that production default. Its health probe is `http://localhost:8089/`. [LiveKit server options](https://docs.livekit.io/agents/server/options/), [Expo CLI ports](https://docs.expo.dev/more/expo-cli/#server-url).

If the app displays only `not found` and stays on the splash screen, check `http://localhost:8081/status`: Metro returns `packager-status:running`. A LiveKit server responds with `404 not found`; `http://localhost:8081/worker` then identifies the process using the wrong port. Stop the old `pnpm dev` process with Ctrl+C, restart it after updating the worker configuration, and reload the app. Reloading alone does not restart the Node worker or release its old port. No native rebuild is needed for this port change.

A successful mobile room connection does not imply that an agent worker is running. The API creates an explicit dispatch, and an independently running worker must accept it and publish `codaloud.voice.ready`. If readiness does not arrive within 20 seconds, the client intentionally leaves and deletes its room without publishing microphone audio. A client leave followed by WebSocket close code 1001 is not, by itself, evidence that a network failure caused the leave. Check the preceding readiness warning and worker terminal logs. [Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch/).

If the readiness warning appears while the worker is registered, inspect that terminal for job acceptance, startup failures, and provider errors. Registration and the API must use the same project and agent name. Releasing a held microphone during setup, tapping Stop, navigating away, or backgrounding the app also intentionally cancels setup. Use hands-free mode when checking startup without holding the button.

The development supervisor is covered by offline child-process lifecycle tests. The actual Agents 1.9 job runner was also checked locally through its initialization IPC with placeholder credentials; it imported the TypeScript agent and initialized without a room or provider call. This verifies local loading, not cloud registration or a complete conversation.
