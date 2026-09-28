# Provider SDK setup

Verified on 2026-09-21 against official documentation, repositories, and npm `latest` metadata. This setup supplies server-side provider clients; application routes, microphone capture, agent sessions, tool execution, and billing integration are separate work.

## Package selection

| Service folder | Package                       | Latest stable verified | Purpose                                                |
| -------------- | ----------------------------- | ---------------------- | ------------------------------------------------------ |
| `ai`           | `ai`                          | `7.0.107`              | Model generation, streaming, structured outputs, tools |
| `ai`           | `@openrouter/ai-sdk-provider` | `3.1.0`                | OpenRouter provider for AI SDK 7                       |
| `firecrawl`    | `firecrawl`                   | `4.41.0`               | Web search, scraping, crawl jobs                       |
| `livekit`      | `livekit-server-sdk`          | `2.19.1`               | Room management, agent dispatch, participant tokens    |
| `deepgram`     | `@deepgram/sdk`               | `5.12.0`               | Direct transcription API client                        |
| `elevenlabs`   | `@elevenlabs/elevenlabs-js`   | `2.68.0`               | Direct speech synthesis API client                     |

Versions were obtained with `npm view <package> version`. Registry metadata: [AI SDK](https://registry.npmjs.org/ai/latest), [OpenRouter provider](https://registry.npmjs.org/@openrouter%2fai-sdk-provider/latest), [Firecrawl](https://registry.npmjs.org/firecrawl/latest), [LiveKit server](https://registry.npmjs.org/livekit-server-sdk/latest), [Deepgram](https://registry.npmjs.org/@deepgram%2fsdk/latest), [ElevenLabs](https://registry.npmjs.org/@elevenlabs%2felevenlabs-js/latest).

AI SDK 7 and Firecrawl 4.41 require Node 22 or newer. OpenRouter provider 3.1 is ESM-only and declares `ai: ^7.0.0` and `zod: ^3.25.76 || ^4.1.8` peer dependencies. This project's Zod 4.5 satisfies the peer range. Use an ESM-capable server build and Node 22+ runtime. [OpenRouter SDK source](https://github.com/OpenRouterTeam/ai-sdk-provider), [AI engine metadata](https://registry.npmjs.org/ai/7.0.107), [Firecrawl engine metadata](https://registry.npmjs.org/firecrawl/4.41.0).

## AI and OpenRouter

Use `createOpenRouter({ apiKey })` from `@openrouter/ai-sdk-provider`, together with `generateText` and `streamText` from `ai`. Both belong to `services/ai`; a standalone OpenRouter SDK is unnecessary. Pass explicit provider model objects to AI SDK calls. Keep model selection at the caller boundary because command routing and substantive coding have different needs. The provider accepts `session_id`, provider routing options, and usage accounting; returned provider metadata can contain cost details. [OpenRouter integration](https://openrouter.ai/docs/guides/community/vercel-ai-sdk), [provider repository](https://github.com/OpenRouterTeam/ai-sdk-provider).

Codaloud policy: only accepted utterances become model input. Interim transcripts update the UI. Context assembly, tool loops, token budgets, cancellation, usage persistence, and typed UI streams belong to the future command execution layer; client construction should not trigger a model request.

## Firecrawl

The current official package is `firecrawl`, with the named import `import { Firecrawl } from 'firecrawl'`. Initialize it with the typed server API key. Its API exposes `search(query, options)`, `scrape(url, options)`, `startCrawl`, `getCrawlStatus`, and `cancelCrawl`. The blocking `crawl` helper polls until completion; use the nonblocking job methods when a durable task owns polling. [Official Node SDK](https://docs.firecrawl.dev/sdks/node).

Search results are grouped by source: `result.web`, `result.news`, and `result.images`. Search can optionally scrape every result through `scrapeOptions`; a lean search followed by selected page scraping lets the command layer control cost and context size. Preserve URLs for citations. A bounded initial result limit and Markdown page output fit Codaloud's research tools. [Official search documentation](https://docs.firecrawl.dev/features/search).

## LiveKit

`LiveKitAPI({ host, apiKey, secret })` is the current unified server client. Its `room` and `agentDispatch` properties support the backend control plane. Create participant credentials with `new AccessToken(apiKey, secret, { identity, ttl })`, `addGrant`, and asynchronous `toJwt()`. Specify a short TTL and room-specific permissions when the token helper is used; authentication and room ownership must be checked by its future caller. Keep API keys and secrets server-side. [LiveKit server SDK reference](https://docs.livekit.io/reference/server-sdk-js/).

The server SDK manages rooms and credentials; it does not run an audio participant. A realtime worker uses the separately deployed LiveKit Agents runtime. The worker owns audio stream lifecycles, turn handling, interruption, and cleanup. The mobile app later requires its native LiveKit client integration. [LiveKit Agents Node reference](https://docs.livekit.io/reference/agents-js/), [voice quickstart](https://docs.livekit.io/agents/start/voice-ai/).

## Deepgram

Version 5 uses `new DeepgramClient({ apiKey })` from `@deepgram/sdk`. `listen.v1.connect` supports Nova-3 with provisional transcripts using `interim_results: 'true'`. `listen.v2.connect` supports conversational Flux and `sendForceEndTurn`. Connections are initially closed: attach handlers, call the returned socket's `connect()`, and await `waitForOpen()` before sending audio with `sendMedia`. An abort signal stops transport and reconnection, but `waitForOpen` needs cancellation-aware handling at the session layer. [Official Deepgram SDK](https://github.com/deepgram/deepgram-js-sdk).

Keep this setup limited to constructing the client and exposing useful configuration. The application must distinguish interim text, finalized segments, and accepted user turns. It must set the encoding, sample rate, and channel count to match the actual audio transport when it integrates capture.

## ElevenLabs

Use `new ElevenLabsClient({ apiKey })` from `@elevenlabs/elevenlabs-js`. `textToSpeech.stream(voiceId, { text, modelId, outputFormat })` returns streaming audio for a supplied text segment. `eleven_flash_v2_5` is an appropriate initial low-latency model candidate; keep voice ID supplied explicitly because voice availability belongs to the account/product configuration. The SDK accepts request-level timeouts and retry limits. Avoid its desktop playback helpers in mobile/server infrastructure. [Official ElevenLabs SDK](https://github.com/elevenlabs/elevenlabs-js), [stream speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream).

Streaming output from a complete text request is distinct from incrementally sending language-model text through the TTS WebSocket API. The future LiveKit worker should own that transport and interruption behavior. ElevenLabs is the TTS provider; Codaloud's reasoning remains with OpenRouter through AI SDK.

## LiveKit plugin compatibility

The latest stable `@livekit/agents`, `@livekit/agents-plugin-deepgram`, and `@livekit/agents-plugin-elevenlabs` are all `1.9.0`. Both plugins declare `@livekit/agents: 1.9.0` and `@livekit/rtc-node: ^0.13.34` peers. [Agents registry](https://registry.npmjs.org/@livekit%2fagents/latest), [Deepgram plugin registry](https://registry.npmjs.org/@livekit%2fagents-plugin-deepgram/latest), [ElevenLabs plugin registry](https://registry.npmjs.org/@livekit%2fagents-plugin-elevenlabs/latest).

These plugins are the direct adapters expected by `AgentSession`: Deepgram exports `STT` for Nova and `STTv2` for Flux; ElevenLabs exports `TTS`. They connect using the provider's own credentials. Direct SDK clients are not interchangeable with these adapters. When implementing the worker, prefer official plugins over recreating their audio streaming integration. Keep runtime/native RTC dependencies in the worker boundary; direct clients remain useful for provider APIs outside a voice session. [Deepgram plugin](https://docs.livekit.io/agents/integrations/stt/deepgram/), [Flux options](https://docs.livekit.io/reference/agents-js/interfaces/plugins_agents_plugin_deepgram.STTv2Options.html), [ElevenLabs plugin](https://docs.livekit.io/agents/models/tts/elevenlabs/).

## Expo boundary and verification

The project targets Expo SDK 57 on iOS and Android. Its API routes are server infrastructure supporting those apps. Provider modules read credentials only through `serverEnv`; they must never enter a screen, client hook, or shared mobile barrel. No SDK constructor should start a request or microphone session. Runtime streams require a worker with an appropriate lifetime. [Expo 57 reference](https://docs.expo.dev/versions/v57.0.0/), [Expo API routes](https://docs.expo.dev/router/web/api-routes/).

Verify package peer resolution and TypeScript compatibility without sending paid provider requests. Check SDK method signatures against installed declarations, because unversioned documentation examples can lag the latest package release.

## Implemented exports

Each service has a server-only `server.ts` entry point. These modules must be imported only by server routes or workers, never by mobile components.

- `services/ai/server.ts`: `openrouter` uses strict OpenRouter compatibility and Codaloud attribution. Use `openrouter.chat(modelId)` with `generateText` or `streamText` from `ai`; select the model per task. No standalone OpenRouter SDK is installed.
- `services/livekit/server.ts`: `livekit` exposes room and agent-dispatch APIs; `livekitWebhookReceiver` verifies webhook bodies. `createVoiceAccessToken(room, identity)` signs a ten-minute token scoped to one room, microphone publication, data publication, and subscriptions. Its future caller must authorize room ownership first.
- `services/deepgram/server.ts`: `deepgram` exposes the direct SDK, including Nova and Flux APIs. `createTranscriptionConnection(options)` prepares a closed Nova-3 socket with interim results, punctuation, formatting, VAD, and configurable endpointing. The caller owns audio format, socket lifecycle, cancellation, and acceptance of completed turns.
- `services/elevenlabs/server.ts`: `elevenlabs` exposes the direct SDK. `streamSpeech(voiceId, request, requestOptions)` defaults to Flash v2.5 and PCM at 24 kHz, with explicit voice selection and overridable synthesis settings. Its output is raw audio, not a mobile playback object.
- `services/firecrawl/server.ts`: `firecrawl` exposes search, scrape, and asynchronous crawl APIs with a 60-second request timeout. Query/result limits and citation extraction belong to the future tools.

Deepgram, ElevenLabs, and Firecrawl automatic request retries are disabled so a future command/job layer can own retry budgets. Deepgram automatic reconnection is also disabled; recovery must respect turn boundaries and avoid duplicate commands. No provider requests or connections run at module import.

All six dependency versions are pinned exactly. pnpm added narrowly scoped release-age exceptions for `@deepgram/sdk@5.12.0` and `livekit-server-sdk@2.19.1` to install the requested latest releases. Existing environment schema declarations are preserved, with missing runtime mappings added for the seven provider variables.

Validation: TypeScript passes. Offline Node 24 verification successfully imported all modules, constructed an OpenRouter model, checked public SDK methods, and verified a signed LiveKit token's room, identity, expiration, and microphone-only publication grant using dummy credentials. No paid API requests were sent; live account permissions, voice availability, audio quality, and deployed-worker behavior remain unverified.
