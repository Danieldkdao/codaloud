# Voice runtime integration

Verified on 2026-09-21 using official LiveKit documentation, npm metadata, the published Agents 1.9.0 source archive, and installed package declarations. No provider inference, transcription, or synthesis requests were made.

## Runtime packages and deployment

`@livekit/agents`, `@livekit/agents-plugin-deepgram`, and `@livekit/agents-plugin-elevenlabs` latest stable versions are all `1.9.0`. Both plugins require that exact Agents version and `@livekit/rtc-node: ^0.13.34`. The worker runs as a persistent Node process independently of Expo API routes. Its API credentials come from typed server environment exports. [Agents registry](https://registry.npmjs.org/@livekit%2fagents/latest), [Deepgram registry](https://registry.npmjs.org/@livekit%2fagents-plugin-deepgram/latest), [ElevenLabs registry](https://registry.npmjs.org/@livekit%2fagents-plugin-elevenlabs/latest).

Current entry points are `defineAgent`, `ServerOptions`, and `cli.runApp`. `WorkerOptions` is a deprecated alias. The default export is `defineAgent({ entry: async (ctx: JobContext) => { ... } })`. Start a session with `await session.start({ agent, room: ctx.room, record: false })`, then `await ctx.connect()`. Start the executable with `cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName, wsURL, apiKey, apiSecret }))`. A named agent requires explicit dispatch; the token API and worker must use the same agent name. [Official quickstart](https://docs.livekit.io/agents/start/voice-ai/), [published worker source](https://github.com/livekit/agents-js/blob/main/agents/src/worker.ts).

## Speech provider adapters

The LiveKit plugins implement the `AgentSession` STT/TTS interfaces. Direct Deepgram and ElevenLabs SDK clients are not substitutes for those plugins.

- Nova streaming recognition: `new deepgram.STT({ apiKey, model: 'nova-3', language: 'en', interimResults: true, endpointing: 500, utteranceEndMs: 1000 })`. Nova uses `keyterm: string[]`.
- Flux conversational recognition: `new deepgram.STTv2({ apiKey, model: 'flux-general-en', eotThreshold: 0.7, eotTimeoutMs: 1000 })`. Flux uses `keyterms: string[]`. Omit `eagerEotThreshold` when speculative model calls are unwanted.
- ElevenLabs synthesis: `new elevenlabs.TTS({ apiKey, voiceId, model: 'eleven_flash_v2_5', encoding: 'pcm_24000' })`. Pin a voice ID appropriate for the account; the Node plugin documents `bIHbv24MWmeRgasZH58o` as its default. Pass the key explicitly because the plugin's environment convention is `ELEVEN_API_KEY`, whereas Codaloud uses its typed environment export.

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

Use the existing `openrouter` provider with `streamText` from `ai`. LiveKit supports a custom `llmNode`, so an additional OpenAI or OpenRouter LiveKit plugin is unnecessary. Convert only text user and assistant chat messages into AI SDK model messages, pass Codaloud instructions separately, bound retained context and generated tokens, and supply no tools. Call the model once per committed user turn. [Pipeline hooks](https://docs.livekit.io/agents/logic/nodes/), [OpenRouter AI SDK integration](https://openrouter.ai/docs/guides/community/vercel-ai-sdk).

The functional API is `voice.Agent.create({ instructions, llmNode: (ctx, chatCtx, toolCtx, modelSettings) => asyncIterable })`; plain text chunks are supported. A subclass can instead override `llmNode` and return `Promise<ReadableStream<string> | null>`, using `ReadableStream` from `node:stream/web`.

Cancellation needs deliberate wiring: hook context and `ModelSettings` contain no abort signal. The pipeline cancels its returned stream when interrupted. A stream adapter's `cancel()` should synchronously abort the controller passed to `streamText({ abortSignal })`. A custom async iterator may do the same in `return()`. An async generator's `finally` alone can remain blocked behind a pending provider read. Pass `maxRetries: 0`, a finite `maxOutputTokens`, and `timeout: { totalMs, firstChunkMs, chunkMs }` to prevent unbounded retries and stalled generation. [Published generation source](https://github.com/livekit/agents-js/blob/main/agents/src/voice/generation.ts), [AI SDK streaming reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text).

## Transcript delivery

RoomIO automatically forwards user interim/final transcripts and assistant text on `lk.transcription` with `transcriptionEnabled: true`. Header attributes include `lk.segment_id`, `lk.transcription_final`, and `lk.transcribed_track_id`. `senderIdentity` identifies the user or agent.

User segments are snapshots: each new stream for a segment replaces its preceding text. Assistant segments are deltas inside a single stream: accumulate chunks and finalize on stream closure. The Node transport cannot change the assistant stream's final header attribute on close, so do not wait exclusively for `lk.transcription_final: 'true'`. Native clients can consume these with `room.registerTextStreamHandler('lk.transcription', (reader, participantInfo) => ...)`.

`outputOptions.syncTranscription` defaults to true, aligning agent words with playback. False forwards text as soon as generation makes it available. Keep transcript UI state ephemeral and bounded; explicitly set `record: false` on session startup to avoid implicit session recording. [Text/transcription guide](https://docs.livekit.io/agents/multimodality/text/), [RoomIO output source](https://github.com/livekit/agents-js/blob/main/agents/src/voice/room_io/_output.ts), [RoomIO source](https://github.com/livekit/agents-js/blob/main/agents/src/voice/room_io/room_io.ts).

## Offline verification boundaries

Test gesture intent, RPC ownership, turn commitment, transcript replacement, streaming cancellation, reconnect cleanup, and bounded context with fake transports. Typecheck worker APIs against installed 1.9 declarations. Do not start a connected worker or call paid providers during automated verification. Live device permission behavior, audio routing, endpointing latency, free-model availability, and ElevenLabs voice entitlement need the user's manual demo.
