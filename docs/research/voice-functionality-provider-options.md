# Voice functionality provider and architecture options

Prepared September 21, 2026. This is a point-in-time review of official provider and project documentation. Prices, model names, preview status, supported regions, and SDK requirements should be rechecked immediately before implementation or contracting.

## Recommendation

Codaloud should implement **a realtime voice coordinator in front of a provider-neutral coding-agent service**. The voice layer owns capture, turn detection, interruption, partial/final transcripts, short spoken responses, and tool requests. It must not own code edits, Git operations, job state, or durable activity.

For the first production integration, the strongest choices are:

1. **ElevenLabs Agents** is the most practical first production choice if Codaloud intends to deliver the current full experience immediately: press-and-hold commands, a locked continuous conversation, interruptions, transcripts, spoken acknowledgements, and device tools. It has the best documented Expo path: a first-party React Native SDK designed for Expo, using LiveKit WebRTC. Its per-minute platform charge plus separately billed LLM is the main tradeoff, and its tools must terminate at Codaloud's orchestration boundary rather than mutate the workspace directly.
2. **LiveKit Agents with interchangeable STT/LLM/TTS providers** is the strongest long-term-control option. LiveKit has an Expo/React Native WebRTC client and provider plugins, so Codaloud can combine Deepgram transcription, an OpenRouter-backed coordinator, and ElevenLabs or another TTS engine. It adds an agent worker and media infrastructure, but it avoids placing the whole voice experience inside one vendor's hosted agent product.
3. **OpenAI Realtime over WebRTC** is the strongest single-model alternative. OpenAI recommends WebRTC for mobile clients, offers server-minted client secrets, semantic VAD, transcripts, function tools, and automatic WebRTC interruption handling. The React Native integration still needs a WebRTC native module and a custom development build; OpenAI's official examples use browser APIs rather than an Expo SDK.
4. **Deepgram Voice Agent** provides an unusually modular, cost-transparent managed pipeline and safe end-of-turn controls, but Codaloud must own a raw-audio WebSocket client because Deepgram has no comparable first-party Expo SDK. **Gemini Live** is compelling for low published audio rates, asynchronous tools, and future screen/video understanding, but Preview ephemeral credentials, periodic session resumption, raw PCM playback, and accumulating audio-context costs make it a higher-risk first integration.

The provider should be chosen through a short native bake-off, using the same coding vocabulary and noisy mobile recordings. The production decision should be based on end-of-turn latency, transcript correction stability, code identifier accuracy, reconnect behavior, battery use, and effective cost per completed instruction. Published model benchmarks do not answer those questions for Codaloud.

## What Codaloud appears to need

The current Notion product specification describes a native-only iOS/Android voice-first coding app. The workspace dock already exposes a microphone, but it has no handler. The current interaction contract says:

- press-and-hold starts capture, and release finalizes and submits one instruction;
- sliding away cancels the unsent press-and-hold utterance;
- double-tap locks the microphone open for continuous conversation, where silence ends a turn rather than the session;
- the live transcript is visible and compact, with a finishing countdown that speech can extend or correct;
- stopping capture does not cancel an accepted job;
- accepted jobs stay attached to their captured file, symbol, selection, or branch;
- voice invokes the same operations and outcomes as manual UI;
- Agent is a durable activity and result log, not another chat UI;
- long checks, builds, edits, Git work, reviews, retries, and cancellations outlive the voice turn.

Sources: [current Codaloud product specification](https://app.notion.com/p/3d2b3d6d3d6f809b9c82e98a68e01be1), [workspace dock](../../src/features/projects/components/project-workspace-dock.tsx), [demo Agent activity](../../src/features/projects/data/demo-agent-activity.ts), [project package versions](../../package.json). The older [workspace UI options](../design/workspace-ui-options.md) remain useful layout research, but their tap/auto-send modes are superseded by the current Notion interaction contract.

This requires both **transactional command submission** and **an interruptible realtime conversation**. Spoken feedback remains a presentation and coordination channel over the same durable job model; it must not become a second execution system.

## Provider comparison

| Criterion | OpenAI Realtime | Gemini Live | ElevenLabs Agents | Deepgram Voice Agent |
| --- | --- | --- | --- | --- |
| Mobile transport | WebRTC recommended for browser/mobile; WebSocket intended primarily for server-to-server | Bidirectional WebSocket; raw PCM chunks | First-party React Native/Expo SDK over LiveKit WebRTC | Single WebSocket; raw binary audio and JSON control/events |
| Client credential | Server mints short-lived Realtime client secret | Server mints constrained ephemeral token; feature is Preview | Public agent ID or backend-issued conversation token/signed access for private agents | Backend grants temporary JWT, 30 seconds by default and up to one hour; token only needs to be valid at socket open |
| Expo effort | Medium: native WebRTC integration and audio-session work; no first-party Expo SDK in the official guide | High: native raw PCM capture, resampling, playback, and reconnect management | Low/medium: SDK is designed for Expo but requires a development build and LiveKit native dependencies | High: native raw PCM capture/playback and WebSocket state machine |
| Tool calling | Application functions and remote MCP; application returns function output | Function calling; Gemini 3.8 Live defaults to async non-blocking calls and supports scheduling | Client tools, webhooks, hosted code tools, system tools, and MCP | Client- or server-side functions; irreversible calls can be deferred until end of turn |
| VAD / interruption | Server and semantic VAD; automatic interruption/truncation with WebRTC; manual work required with WebSocket | Automatic VAD; interruption cancels generation and pending calls; manual and hybrid VAD supported | Configurable turn eagerness, timeouts, client VAD score, default interruptions, and per-tool interruption modes | Flux endpointing, `UserStartedSpeaking`, barge-in, cancelled speculative calls, and explicit end-turn controls |
| Live transcript | Input transcript deltas and completion events; output transcript with audio | Optional input/output transcription; dedicated Live Transcription also exposes interim/final text | `onMessage` can receive tentative/final user transcripts and agent replies; post-call conversation transcript APIs | `ConversationText`/history events for user and agent; client is expected to persist events for turn-level observability |
| Model flexibility | Realtime session is tied to OpenAI realtime models/voices | Tied to Gemini Live models and Google voices | Many OpenAI, Google, Anthropic, and ElevenLabs-hosted LLMs; custom LLM endpoint and fallback cascade | Managed OpenAI/Anthropic/Google/NVIDIA plus Groq/Bedrock and arbitrary OpenAI-compatible BYO LLM; independent Deepgram/Cartesia/ElevenLabs/OpenAI/AWS TTS choices |
| Current base pricing | GPT-Realtime audio: $32/M input audio tokens and $64/M output audio tokens; separate text token charges | Gemini 3.8 Live: $3/M input audio tokens or about $0.005/min; $12/M output audio tokens or about $0.018/min; transcript text is extra and historical audio is re-billed per turn | $0.08/min additional hosted call time, $0.16 burst, plus LLM usage; plan includes minutes/concurrency | Standard $0.075/min pay-as-you-go; BYO combinations reach $0.050/min; advanced managed models cost more |
| Default content retention | API data not used for training unless opted in; abuse logs up to 30 days; `/v1/realtime` is ZDR-eligible for approved customers | Paid API content is not used to improve products, but limited abuse logging applies; ZDR requires avoiding session resumption and other storage features, or using Vertex AI for stronger controls | Conversation transcript/audio default retention is 2 years, configurable; enterprise zero-retention mode available | Model Improvement Program and content retention are on by default; `mip_opt_out: true` makes content zero-retention after processing |
| Data regions | Project data residency is available in documented regions, with additional approval/ZDR requirements outside the US; verify Realtime/model support in the target region | Developer API is available across a long country list, but its terms allow transient/cached processing in Google facilities; use Vertex AI for contractual enterprise controls | US default; isolated EU, India, and Singapore workspaces are enterprise features; model availability varies | Global plus EU, Australia, and India regional Voice Agent endpoints; in-region guarantee requires regional endpoint plus MIP opt-out; third-party LLM terms still apply |
| Material limits | Maximum Realtime session is 60 minutes; WebSocket clients must implement playback truncation themselves | Raw PCM only; native-audio model output modality is audio; connection lifetime about 10 minutes; session resumption/compression needed for longer calls; cost compounds with retained context | First-party SDK is convenient but platform-hosted agent configuration and per-minute billing create lock-in; Expo Go unsupported; default max conversation is 10 minutes, configurable to 2 hours | No first-party React Native SDK; sessions end after 2 hours; client must own native audio; early speculative function calls require `defer_until_eot` for irreversible actions |

Pricing sources: [OpenAI GPT-Realtime model](https://developers.openai.com/api/docs/models/gpt-realtime), [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini Live billing behavior](https://ai.google.dev/gemini-api/docs/live-api/best-practices), [ElevenAgents pricing](https://elevenlabs.io/pricing/agents), [Deepgram pricing](https://deepgram.com/pricing). Pricing is not apples-to-apples: OpenAI and Gemini are token-metered native multimodal models; ElevenLabs and Deepgram include more of the STT/orchestration/TTS pipeline in a connection-minute rate, with qualifications for LLM/TTS selection.

### OpenAI Realtime API

OpenAI explicitly recommends WebRTC over WebSockets for browser and mobile clients because it gives more consistent performance. The secure client pattern is a small Codaloud API route that uses the standard server key to mint a client secret, followed by a direct WebRTC connection from the device. Media flows as WebRTC tracks and application events flow over a data channel. Standard keys remain server-only. [OpenAI WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc)

This is a good fit for Expo development builds through a React Native WebRTC package, but the official OpenAI guide demonstrates browser `RTCPeerConnection`, `getUserMedia`, and DOM audio rather than a maintained first-party React Native abstraction. Codaloud would own native audio routing, Bluetooth/headset changes, interruptions, lifecycle, and reconnection behavior.

Realtime supports application-owned function tools and direct remote MCP tools. For Codaloud, provider function calls should be interpreted as requests to the coding orchestration service; the voice session should not mutate the workspace directly. [OpenAI Realtime tools and MCP](https://developers.openai.com/api/docs/guides/realtime-mcp)

Server VAD uses silence; semantic VAD uses the meaning of the utterance to decide when the user is done and exposes an eagerness setting. With WebRTC, OpenAI tracks played output and automatically truncates unplayed audio when the user interrupts. With WebSockets, the client must stop playback, measure played audio, cancel the response, and send a truncate event. Push-to-talk is supported by disabling VAD and gating audio in the app. [OpenAI VAD](https://developers.openai.com/api/docs/guides/realtime-vad), [OpenAI conversation and interruption flow](https://developers.openai.com/api/docs/guides/realtime-conversations)

For the first vertical slice, OpenAI documents transcription mode for cases where the application does not yet need a model response. That can validate capture, transcript, and release-to-submit behavior before continuous conversation is enabled. The completed experience can use the same connection abstraction in conversational mode. [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)

Data sent through the API is not used to train OpenAI models unless the customer opts in. Realtime has no application-state retention and is eligible for Zero Data Retention for approved organizations; the default abuse-monitoring window is up to 30 days. Regional residency requires careful model/endpoint verification and, for non-US projects, approval for abuse-monitoring controls plus a ZDR amendment. [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)

Best fit: direct native speech-to-speech and strong model/tool integration, provided Codaloud is comfortable using OpenAI for the realtime model and building a React Native WebRTC layer.

### Google Gemini Live API

Gemini Live is a bidirectional WebSocket API. Direct mobile clients should obtain a constrained ephemeral token from Codaloud's backend; Google describes these tokens as Preview. Audio input is raw little-endian 16-bit PCM, natively 16 kHz, and audio output is 24 kHz PCM. Expo Audio 57 exposes realtime PCM microphone capture through `useAudioStream`, which reduces input-side work, but Codaloud would still own format conversion where needed, jitter-buffered streaming playback, audio routing, and reconnection. [Gemini Live ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities), [Expo SDK 57 Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)

Gemini 3.8 Live supports audio, images, and video input, audio/text output data, search grounding, interleaved reasoning, and function calling. Its asynchronous function calling defaults to non-blocking behavior. Native-audio sessions only accept `AUDIO` as the response modality, so a text UI must enable output transcription. [Gemini 3.8 Live model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)

Automatic VAD is enabled by default. When the user interrupts, Gemini cancels the current generation and pending function calls and emits cancellation information; the client must clear queued playback. Manual VAD and a hybrid approach are also available. Input and output transcripts are opt-in. Google's dedicated live transcription model supports interim and final transcripts, manual/hybrid VAD, language detection, custom vocabulary, and smart transcript formatting, which could be evaluated separately from the conversational model. [Gemini Live VAD and transcripts](https://ai.google.dev/gemini-api/docs/live-api/capabilities), [Gemini Live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)

Without compression, audio-only sessions are limited to about 15 minutes, and a WebSocket connection itself lasts about 10 minutes. Session resumption handles planned resets and context-window compression can extend session duration, but resumption stores session data for up to 24 hours. Gemini also reprocesses and re-bills the retained raw-audio context each turn; transcript tokens are an additional charge. Codaloud's short command turns reduce that issue, while an always-open session amplifies it. [Gemini Live session management](https://ai.google.dev/gemini-api/docs/live-api/session-management), [Gemini Live billing](https://ai.google.dev/gemini-api/docs/live-api/best-practices), [Gemini Developer API ZDR](https://ai.google.dev/gemini-api/docs/zdr)

On paid Gemini Developer API usage, prompts and responses are not used to improve Google's products, but Google logs them for a limited period for abuse detection and may process transient or cached content in countries where Google or its agents operate. Google recommends Vertex AI when guaranteed zero retention or enterprise data-processing agreements are required. [Gemini API terms](https://ai.google.dev/gemini-api/terms), [Gemini Developer API ZDR](https://ai.google.dev/gemini-api/docs/zdr), [Vertex AI ZDR](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention)

Best fit: future multimodal pair programming that can hear the user and see a screen/image stream. Its custom transport and session management make it a higher-risk first provider for Codaloud.

### ElevenLabs Agents Platform

ElevenLabs has the clearest first-party mobile story. Its React Native SDK is explicitly designed for Expo, uses LiveKit WebRTC dependencies, requires React Native 0.79 or newer, and works only in a development build rather than Expo Go. Codaloud already uses Expo 57, React Native 0.86, and `expo-dev-client`, so its baseline is compatible. The SDK exposes status, listening/speaking mode, message callbacks, VAD score, audio, client tool registration, feedback, and raw-conversation access. [ElevenLabs React Native SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react-native), [ElevenLabs React SDK events](https://elevenlabs.io/docs/eleven-agents/libraries/react)

The platform exposes tentative and final user transcripts through message callbacks, plus post-call conversation details. It provides configurable turn eagerness, silence timeouts, interruption behavior, and conversation limits. Default maximum duration is 10 minutes and can be configured between 1 minute and 2 hours. [ElevenLabs conversation flow](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow), [ElevenLabs events](https://elevenlabs.io/docs/eleven-agents/customization/events)

Tools can run on the device, call a webhook, execute hosted JavaScript, use a built-in system operation, or connect to MCP. Client tools are useful for UI navigation and reading local state, but code and Git mutations should still go through Codaloud's orchestration service. Per-tool interruption policies can prevent a tool from being interrupted during execution or through the rest of a turn. [ElevenLabs tools](https://elevenlabs.io/docs/eleven-agents/customization/tools), [ElevenLabs client tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools), [ElevenLabs tool interruptions](https://elevenlabs.io/docs/eleven-agents/customization/tools/tool-configuration/tool-interruptions)

ElevenLabs supports a broad list of OpenAI, Google, Anthropic, and hosted Qwen models, a custom LLM endpoint, and configurable fallback models. This limits reasoning-provider lock-in, although the realtime orchestration, transport, voice, configuration, and observability remain ElevenLabs-specific. [ElevenLabs models](https://elevenlabs.io/docs/eleven-agents/customization/llm)

The current self-service rate is $0.08 per additional call minute, with $0.16 burst pricing above included concurrency; LLM and telephony charges are separate. Silence longer than 10 seconds is billed at 5% of the normal per-minute rate. [ElevenAgents pricing](https://elevenlabs.io/pricing/agents), [ElevenAgents cost behavior](https://help.elevenlabs.io/hc/en-us/articles/29298065878929-How-much-does-ElevenAgents-cost)

Default transcript and recording retention is two years, configurable separately down to scheduled deletion. Enterprise customers can enable Zero Retention Mode per agent. Enterprise isolated environments are available in the EU, India, and Singapore, while the US is the standard location; model availability and processing restrictions vary by region and optional integration. [ElevenLabs retention](https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention), [ElevenLabs zero retention](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode), [ElevenLabs data residency](https://elevenlabs.io/docs/overview/administration/data-residency)

Best fit: quickest implementation of a premium conversational voice experience, especially if spoken agent replies are core from day one. It is more platform and recurring cost than a transcription-only command bar needs.

### Deepgram Voice Agent API

Deepgram exposes one WebSocket that combines listening, reasoning, speaking, tool calls, transcripts, and control messages. A direct mobile client can authenticate with a server-granted temporary JWT. The default JWT lifetime is 30 seconds, can be raised to one hour for mobile, and only needs to remain valid for the initial WebSocket handshake. [Deepgram Voice Agent getting started](https://developers.deepgram.com/docs/build-a-voice-agent), [Deepgram temporary token authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication)

The client sends raw audio and receives raw binary audio plus JSON events. Conversation text, user-started-speaking, agent-thinking, function-call, cancellation, completion, and latency events are exposed. Deepgram recommends recording all non-audio frames if per-session turn-level observability is needed; the dashboard alone does not provide it. This aligns with Codaloud's need for its own durable Agent log. [Deepgram server events](https://developers.deepgram.com/docs/voice-agent-outputs), [Deepgram Voice Agent observability](https://developers.deepgram.com/docs/voice-agent-observability)

Deepgram offers the most interchangeable pipeline. Managed and BYO LLMs include OpenAI, Anthropic, Google, NVIDIA, Groq, Bedrock, and arbitrary OpenAI-compatible endpoints, with ordered cross-provider fallback. TTS can use Deepgram Flux/Aura, managed Cartesia, or BYO ElevenLabs, OpenAI, AWS Polly, and other supported endpoints. [Deepgram LLM models](https://developers.deepgram.com/docs/voice-agent-llm-models), [Deepgram TTS models](https://developers.deepgram.com/docs/voice-agent-tts-models)

Function calls can execute on the client or at a server endpoint. Deepgram can dispatch calls speculatively before end-of-turn confirmation to reduce latency, so every irreversible Codaloud mutation must set `defer_until_eot: true` or, preferably, merely enqueue a validated orchestration command that has its own idempotency and review contract. The API emits cancellation events if a user resumes speaking. [Deepgram function calling](https://developers.deepgram.com/docs/voice-agents-function-calling)

Pay-as-you-go Voice Agent pricing is $0.075/minute for Standard, $0.163/minute for Advanced, and as low as $0.050/minute when both LLM and TTS are BYO. Deepgram counts WebSocket connection time, so Codaloud should close idle sessions and measure its intended always-listening behavior. [Deepgram pricing](https://deepgram.com/pricing), [Deepgram build guide](https://developers.deepgram.com/docs/build-a-voice-agent)

Deepgram retains Voice Agent audio, intermediate transcripts/context, and synthesized audio for model improvement by default. Setting `mip_opt_out: true` makes content zero-retention after processing, while content-free usage metadata remains retrievable for 90 days. EU, Australia, and India regional endpoints support Voice Agent; full in-region handling requires the regional endpoint and MIP opt-out. A chosen third-party LLM remains subject to that provider's data terms. [Deepgram data handling](https://developers.deepgram.com/trust-security/your-data)

Best fit: a modular, cost-transparent realtime pipeline when Codaloud is prepared to build its own native audio streaming layer.

## Architecture options

### Option A — realtime voice coordinator plus durable coding orchestrator

This is the recommended production architecture regardless of which realtime provider is selected.

```text
iOS / Android app
  microphone + native audio session
  live partial/final transcript
  press/hold and locked-conversation state
  target snapshot + revision
            |
            | direct realtime media using a short-lived token
            v
  realtime voice provider
    turn detection + interruption + short spoken feedback
    read-only tool requests + stable command requests
            |
            | normalized transcript/tool events
            v
  app voice state machine
            |
            | release-to-submit or confirmed continuous-turn boundary
            v
  Codaloud API: createCommand
    authenticate user and project
    validate captured target/revision
    idempotency key + policy checks
    persist job and initial activity
            |
            v
  durable coding-agent worker
    inspect workspace -> plan -> tools -> edits/checks
    append typed activity events and artifacts
            |
            v
  app query/realtime updates -> Agent log, diff review, retry/cancel
```

The voice session never owns a long-running code operation. `createCommand` receives a normalized envelope such as:

```ts
type VoiceCommandInput = {
  transcript: string;
  transcriptRevision: number;
  interactionMode: "press-and-hold" | "continuous";
  projectId: string;
  workspaceRevision: string;
  target: FileTarget | SymbolTarget | SelectionTarget | BranchTarget | null;
  clientCommandId: string;
};
```

The target is captured when the utterance is accepted, not looked up later from the user's current screen. The command API returns a durable job ID immediately. Background work streams structured states such as `queued`, `running`, `needs-attention`, `complete`, `failed`, and `cancel-requested`; transcript text is an input artifact, not the job state.

Advantages:

- easiest provider replacement and A/B testing;
- exact match for press-and-hold commands and locked continuous conversation;
- coding model can be selected independently from STT/TTS;
- voice disconnects do not cancel accepted jobs;
- long work survives navigation, app suspension, and provider session limits;
- all manual and spoken operations share one validation, idempotency, and recovery path;
- raw audio retention can default to none while retaining only user-approved text and job events.

Tradeoff: the realtime provider and durable agent must share a precise handoff contract. An ambiguous request can remain in the voice conversation or open the target picker, while accepted work immediately receives its own job ID and lifecycle.

### Option B — transcription-first vertical slice

Deepgram Flux, OpenAI Realtime transcription, or Gemini Live Transcribe can validate microphone capture, partial/final transcript rendering, cancellation, permissions, and the durable `submit_command` path before spoken replies are enabled.

This is a useful engineering milestone, but it is not the completed Notion experience because double-tap continuous conversation requires spoken feedback, interruption, and clarification. Treat it as a vertical slice rather than the product architecture.

### Option C — managed voice-agent platform as the orchestrator

ElevenLabs or Deepgram can own turn-taking, LLM selection, TTS, tools, and conversation history. The platform calls Codaloud webhooks or client tools to perform actions.

This minimizes voice infrastructure, but it gives a voice vendor substantial control over prompt state, tool scheduling, failure behavior, observability, and billing. It is viable for Codaloud when that platform stops at the `submit_command` boundary. Do not equate the vendor conversation ID with the project job ID or allow provider tools to bypass workspace revision checks.

### Option D — composable media framework

A framework such as LiveKit Agents can provide WebRTC transport and let Codaloud mix STT, LLM, and TTS providers. It is the strongest comparator when provider portability matters: ElevenLabs already uses LiveKit for its React Native SDK, and Deepgram documents a LiveKit integration. It adds a media server and agent worker, so the bake-off should determine whether that control justifies the extra operating surface. [LiveKit React Native quickstart](https://docs.livekit.io/home/quickstarts/expo), [Deepgram with LiveKit](https://developers.deepgram.com/docs/build-voice-agent-with-livekit-and-deepgram)

## Recommended internal boundaries

Keep provider-specific code behind four narrow capabilities:

```ts
type VoiceTransport = {
  connect: (credential: EphemeralVoiceCredential) => Promise<void>;
  setCaptureEnabled: (enabled: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
};

type VoiceEventStream = {
  onPartial: (listener: (event: TranscriptPartial) => void) => () => void;
  onFinal: (listener: (event: TranscriptFinal) => void) => () => void;
  onToolRequest: (listener: (event: VoiceToolRequest) => void) => () => void;
  onToolCancelled: (listener: (id: string) => void) => () => void;
  onModeChange: (listener: (mode: "listening" | "thinking" | "speaking") => void) => () => void;
};

type SpokenFeedback = {
  speak: (text: string) => Promise<void>;
  stop: () => Promise<void>;
};

type VoiceCredentialService = {
  createCredential: (input: VoiceSessionInput) => Promise<EphemeralVoiceCredential>;
};
```

Do not expose provider event names to React screens. Normalize connection states (`idle`, `authorizing`, `connecting`, `listening`, `reconnecting`, `permission-denied`, `failed`) and transcript segments in the feature layer. Keep the durable command/job types separate from voice session types.

The server-issued credential must bind, where the provider permits it, the model, response mode, tool list, project/user identifier, and short expiration. The app must never contain a standard provider key. Rate limits and concurrent-session ownership belong at this endpoint.

## Native mobile implications

Codaloud already uses Expo 57, React Native 0.86, and a development client. Any WebRTC or raw PCM option therefore requires a new native build but does not require changing the project to a bare app.

- **WebRTC route:** use a compatible React Native WebRTC/LiveKit module; configure microphone permissions; explicitly handle iOS `AVAudioSession`, Android audio focus, speaker/earpiece routing, Bluetooth, wired-headset disconnects, phone calls, backgrounding, and app suspension. ElevenLabs packages this path most completely.
- **Raw WebSocket route:** Expo Audio 57's `useAudioStream` can emit realtime PCM microphone samples, but Codaloud still needs the provider's expected framing/sample rate plus a jitter-buffered streaming PCM playback path. File recording remains useful as a fallback. [Expo SDK 57 Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)
- **Background behavior:** default to foreground-only capture. Expo warns that background recording affects battery; Android also requires a foreground service with an ongoing notification. Codaloud's screen-level voice dock does not currently require background listening. [Expo SDK 57 Audio background recording](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)
- **Fallback:** permission denial and unsupported audio route should preserve typed/manual commands. A network drop keeps the unsent transcript draft locally and does not label it sent. Already accepted jobs reconcile through the normal activity service.

## Data and retention policy

Before implementation, make these product choices explicit:

1. Default raw audio retention should be **none**. Stream it to the chosen provider and discard client buffers when a turn is finalized.
2. Persist final transcript text only when release-to-submit or a confirmed continuous turn accepts it. Partial hypotheses should remain ephemeral unless diagnostics are explicitly enabled.
3. Make the retained transcript and job activity visible and deletable with the project/account retention policy.
4. Use paid API tiers, disable training/data-sharing options, and enable provider ZDR or opt-out controls where available.
5. Treat code, filenames, repository content, tool outputs, and spoken instructions as customer content. If a managed voice platform forwards them to an LLM or MCP server, that subprocessor's retention and region matter too.
6. Do not enable Gemini session resumption or vendor conversation recording by default merely for convenience; those settings change the retention contract.

## Evaluation plan

Run the same instrumented native prototype against at least OpenAI transcription mode, Deepgram Flux, and ElevenLabs. Add Gemini Live transcription if multimodal voice is a near-term priority. Use recorded and live utterances that cover:

- TypeScript symbols, paths, package names, branch names, hashes, punctuation, and acronyms;
- short commands and multi-clause edits with thinking pauses;
- correction phrases such as “no, change `ProjectCard`, not `ProjectList`”;
- speakerphone, wired headset, Bluetooth, background noise, and poor networks;
- iOS and Android interruption, foreground/background, audio-route change, and reconnect paths.

Measure:

- time from first phoneme to stable partial transcript;
- time from actual speech end to final transcript;
- identifier/path exact-match rate and semantic task accuracy;
- false end-of-turn and false interruption rates;
- reconnect success and lost/duplicated segment rate;
- CPU, memory, thermal impact, and battery drain;
- provider cost per connected minute, spoken minute, finalized instruction, and successfully completed coding job;
- frequency of transcript corrections before the instruction is accepted.

Gate the production choice on the native measurements. A provider that is marginally cheaper per minute but causes more corrections or premature turn commits will cost more in completed-task terms.

## Suggested rollout

1. Build the provider-neutral voice state machine, transcript UI, and durable command/job boundary first.
2. Implement press-and-hold capture, slide-to-cancel, release-to-submit, permissions, and reconnect behavior as the first complete vertical slice.
3. Integrate ElevenLabs and one lower-level comparator, preferably OpenAI Realtime or LiveKit with Deepgram, behind the same domain events and run the native bake-off.
4. Add double-tap continuous conversation with visible Stop, a finishing countdown, interruption, and short spoken feedback.
5. Add revision-aware single-file edits, then multi-file review and durable Agent activity independently of the voice transport.
6. Add read-aloud for explanations, reviews, and results through the `SpokenFeedback` boundary.
7. Reassess the provider after real cost per completed task, correction frequency, session duration, and retention requirements are known.

This sequence preserves the product's current interaction model while keeping OpenAI, Google, ElevenLabs, Deepgram, or a later provider replaceable.
