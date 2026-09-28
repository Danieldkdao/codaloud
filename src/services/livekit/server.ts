import {
  AccessToken,
  LiveKitAPI,
  TrackSource,
  WebhookReceiver,
} from "livekit-server-sdk";

import { serverEnv } from "@/data/env/server";

// Server control plane only; realtime audio requires a separate agent worker.
export const livekit = new LiveKitAPI({
  host: serverEnv.LIVEKIT_URL,
  apiKey: serverEnv.LIVEKIT_API_KEY,
  secret: serverEnv.LIVEKIT_API_SECRET,
  requestTimeout: 15,
});

export const livekitWebhookReceiver = new WebhookReceiver(
  serverEnv.LIVEKIT_API_KEY,
  serverEnv.LIVEKIT_API_SECRET,
);

// Call only after authenticating the user and authorizing ownership of this room.
export const createVoiceAccessToken = async (
  room: string,
  identity: string,
) => {
  if (!room.trim() || !identity.trim()) {
    throw new Error("A voice token requires a room and participant identity.");
  }

  const token = new AccessToken(
    serverEnv.LIVEKIT_API_KEY,
    serverEnv.LIVEKIT_API_SECRET,
    { identity, ttl: "10m" },
  );

  token.addGrant({
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });

  return token.toJwt();
};
