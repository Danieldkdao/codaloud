import WebSocket from "ws";

// Run against an idle iOS development app with a project open.
// Signaling and media stay inside two local peers: no tokens, STUN, or providers.
const probeCapture = async (sdkDefault) => {
  const load = (suffix) => {
    const entry = Array.from(__r.getModules().entries()).find(([, module]) =>
      module.verboseName?.endsWith(suffix),
    );
    if (!entry) throw new Error(`Load the voice UI first: missing ${suffix}`);
    return __r(entry[0]);
  };
  const result = { errors: [], samples: [] };
  globalThis.__codaloudCaptureProbe = { done: false };
  let sender;
  let receiver;
  let stream;
  let audio;
  let owner;
  let configureVoiceAudio;
  let acquired = false;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    owner = load("src/services/livekit/voice-track.ts").voiceAudioSession;
    if (owner.getSnapshot())
      throw new Error("Stop the active voice session first.");
    const voiceHook = Array.from(__r.getModules().values()).find(
      (module) =>
        module.verboseName ===
        "src/features/voice/hooks/use-voice-conversation.ts",
    );
    const bundle = Object.values(voiceHook?.dependencyMap.paths ?? {}).find(
      (path) => path.startsWith("/src/services/livekit/voice-native.bundle?"),
    );
    if (bundle) await globalThis.__loadBundleAsync(bundle);
    load("src/services/livekit/voice-native.ts");
    audio = load("/src/audio/AudioSession.ts").default;
    const { setupIOSAudioManagement } = load("/src/audio/AudioManager.ts");
    const configuration = Array.from(__r.getModules().entries()).find(
      ([, module]) =>
        module.verboseName === "src/services/livekit/voice-audio.ts",
    );
    if (!configuration)
      throw new Error("Reload the app to load the voice audio configuration.");
    const voiceAudio = __r(configuration[0]);
    configureVoiceAudio = voiceAudio.configureVoiceAudio;
    configureVoiceAudio();
    if (sdkDefault) setupIOSAudioManagement();
    await owner.acquire();
    acquired = true;
    const permission = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    permission.getTracks().forEach((track) => track.stop());
    if (!sdkDefault) await voiceAudio.prepareVoiceAudio();
    await audio.startAudioSession();

    sender = new RTCPeerConnection({ iceServers: [] });
    receiver = new RTCPeerConnection({ iceServers: [] });
    const senderCandidates = [];
    const receiverCandidates = [];
    sender.onicecandidate = ({ candidate }) => {
      if (candidate) senderCandidates.push(candidate);
    };
    receiver.onicecandidate = ({ candidate }) => {
      if (candidate) receiverCandidates.push(candidate);
    };
    const negotiate = async () => {
      await sender.setLocalDescription(await sender.createOffer());
      await receiver.setRemoteDescription(sender.localDescription);
      await receiver.setLocalDescription(await receiver.createAnswer());
      await sender.setRemoteDescription(receiver.localDescription);
      await delay(300);
      for (const candidate of senderCandidates.splice(0))
        await receiver.addIceCandidate(candidate);
      for (const candidate of receiverCandidates.splice(0))
        await sender.addIceCandidate(candidate);
    };
    // The agent's track can start playout before the user publishes a microphone.
    sender.addTransceiver("audio", { direction: "recvonly" });
    receiver.addTransceiver("audio", { direction: "sendonly" });
    await negotiate();
    await delay(1000);
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const track = stream.getAudioTracks()[0];
    sender.addTrack(track, stream);
    await negotiate();
    for (let index = 0; index < 3; index++) {
      await delay(1000);
      const stats = Array.from((await sender.getStats()).values());
      const outbound = stats.find(
        (stat) => stat.type === "outbound-rtp" && stat.kind === "audio",
      );
      const source = stats.find(
        (stat) => stat.type === "media-source" && stat.kind === "audio",
      );
      result.samples.push({
        connection: sender.connectionState,
        enabled: track.enabled,
        readyState: track.readyState,
        packetsSent: outbound?.packetsSent ?? 0,
        bytesSent: outbound?.bytesSent ?? 0,
        samplesDuration: source?.totalSamplesDuration ?? 0,
      });
    }
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    sender?.close();
    receiver?.close();
    if (acquired) {
      await audio.stopAudioSession().catch(() => {});
      owner.set(false);
      // The diagnostic must not leave the SDK-default comparison policy installed.
      configureVoiceAudio();
    }
    globalThis.__codaloudCaptureProbe = { done: true, ...result };
  }
};

const sdkDefault = process.argv.includes("--sdk-default");
const runsArgument = process.argv.find((argument) =>
  argument.startsWith("--runs="),
);
const runs = Number(runsArgument?.split("=")[1] ?? 1);
if (!Number.isInteger(runs) || runs < 1 || runs > 20)
  throw new Error("Use --runs=1 through --runs=20.");
const origin = "http://127.0.0.1:8081";
const targets = await fetch(`${origin}/json/list`).then((response) =>
  response.json(),
);
const target = targets.find(
  (item) => item.appId === "com.codaloud.development",
);
if (!target)
  throw new Error(
    "Open Codaloud in the iOS simulator with Metro on port 8081.",
  );
const debuggerUrl = new URL(target.webSocketDebuggerUrl);
debuggerUrl.hostname = "127.0.0.1";
const socket = new WebSocket(debuggerUrl, { origin, perMessageDeflate: false });
let sequence = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  pending.get(message.id)?.(message);
});
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Debugger timed out: ${method}`));
    }, 10_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      pending.delete(id);
      if (message.error || message.result?.exceptionDetails)
        reject(new Error("Simulator evaluation failed."));
      else resolve(message.result?.result?.value);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
try {
  await send("Runtime.enable");
  for (let run = 1; run <= runs; run++) {
    await send("Runtime.evaluate", {
      expression: `(${probeCapture.toString()})(${sdkDefault})`,
    });
    let result;
    // Hermes does not await returned promises through Runtime.evaluate.
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await send("Runtime.evaluate", {
        expression: "globalThis.__codaloudCaptureProbe",
        returnByValue: true,
      });
      if (result?.done) break;
    }
    if (!result?.done)
      throw new Error(
        "Capture probe timed out; check microphone permissions in the simulator.",
      );
    const first = result.samples[0];
    const last = result.samples.at(-1);
    const passed =
      result.errors.length === 0 &&
      last?.connection === "connected" &&
      last.packetsSent > first.packetsSent &&
      last.samplesDuration > first.samplesDuration;
    console.log(
      JSON.stringify({
        run,
        policy: sdkDefault ? "sdk-default" : "application",
        passed,
        ...result,
      }),
    );
    if (!passed) process.exitCode = 1;
  }
} finally {
  await send("Runtime.evaluate", {
    expression: "delete globalThis.__codaloudCaptureProbe",
  }).catch(() => {});
  socket.close();
}
