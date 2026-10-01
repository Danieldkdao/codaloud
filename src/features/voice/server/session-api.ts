import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/helpers";
import { serverEnv } from "@/data/env/server";
import { createVoiceAccessToken, livekit } from "@/services/livekit/server";
import { voiceAgentName } from "../constants";
import { voiceSessionRequestSchema } from "../schemas";
import {
  InsufficientCreditsError,
  requireAvailableCredits,
} from "@/features/billing/server/billing-service";

const respond = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export const handleVoiceSessionRequest = async (request: Request) => {
  let allocatedRoom: string | undefined;
  try {
    // Retry only authentication lookup, before any room allocation. A transient
    // database transport failure must not create duplicate rooms or bypass auth.
    const readCurrentUser = () => getCurrentUser(request.headers);
    const { userId } = await readCurrentUser().catch(() => {
      if (request.signal.aborted) throw new Error("Request cancelled.");
      return readCurrentUser();
    });
    if (request.signal.aborted) throw new Error("Request cancelled.");
    if (!userId) return respond({ message: "Sign in to use voice." }, 401);
    if (request.method !== "POST" && request.method !== "DELETE") {
      return respond({ message: "Method not allowed." }, 405);
    }
    const text = await request.text();
    if (text.length > 1024)
      return respond({ message: "Invalid voice request." }, 400);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return respond({ message: "Invalid voice request." }, 400);
    }
    // Local projects are not cloud resources; every voice room is allocated by
    // the server and owned by the authenticated account, never a client identity.
    const prefix = `voice-${encodeURIComponent(userId)}-`;
    if (request.method === "DELETE") {
      const roomName =
        body && typeof body === "object" && "roomName" in body
          ? body.roomName
          : null;
      if (
        typeof roomName !== "string" ||
        !roomName.startsWith(prefix) ||
        !/^[0-9a-f-]{36}$/.test(roomName.slice(prefix.length))
      ) {
        return respond({ message: "This voice session is not yours." }, 403);
      }
      await livekit.room.deleteRoom(roomName);
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const input = voiceSessionRequestSchema.safeParse(body);
    if (!input.success) return respond({ message: "Invalid voice mode." }, 400);
    await requireAvailableCredits(userId);
    const roomName = `${prefix}${randomUUID()}`;
    await livekit.room.createRoom({
      name: roomName,
      maxParticipants: 2,
      emptyTimeout: 60,
      departureTimeout: 10,
    });
    allocatedRoom = roomName;
    await livekit.agentDispatch.createDispatch(roomName, voiceAgentName, {
      metadata: JSON.stringify({
        participantIdentity: userId,
        ...input.data,
      }),
    });
    const token = await createVoiceAccessToken(roomName, userId);
    return respond(
      {
        serverUrl: serverEnv.LIVEKIT_URL,
        token,
        roomName,
        participantIdentity: userId,
        mode: input.data.mode,
      },
      200,
    );
  } catch (error) {
    if (error instanceof InsufficientCreditsError)
      return respond(
        {
          message: "You need more credits before starting voice.",
          action: "billing",
        },
        402,
      );
    if (allocatedRoom)
      await livekit.room.deleteRoom(allocatedRoom).catch(() => undefined);
    return respond({ message: "Voice is unavailable. Please try again." }, 503);
  }
};
