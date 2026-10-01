import { beforeEach, expect, it, vi } from "vitest";
import { handleVoiceSessionRequest } from "../server/session-api";
import { InsufficientCreditsError } from "@/features/billing/server/billing-service";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  createRoom: vi.fn(),
  deleteRoom: vi.fn(),
  dispatch: vi.fn(),
  token: vi.fn(),
  credits: vi.fn(),
}));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("@/services/livekit/server", () => ({
  livekit: {
    room: { createRoom: mocks.createRoom, deleteRoom: mocks.deleteRoom },
    agentDispatch: { createDispatch: mocks.dispatch },
  },
  createVoiceAccessToken: mocks.token,
}));
vi.mock("@/data/env/server", () => ({
  serverEnv: { LIVEKIT_URL: "wss://voice.test" },
}));
vi.mock("@/features/billing/server/billing-service", () => ({
  requireAvailableCredits: mocks.credits,
  InsufficientCreditsError: class extends Error {},
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-one" } });
  mocks.createRoom.mockResolvedValue({});
  mocks.dispatch.mockResolvedValue({});
  mocks.token.mockResolvedValue("signed-token");
  mocks.deleteRoom.mockResolvedValue(undefined);
  mocks.credits.mockResolvedValue({ tier: "free", monthlyCredits: 50 });
});
it("blocks a voice session before allocation when credits are exhausted", async () => {
  mocks.credits.mockRejectedValue(new InsufficientCreditsError());
  expect((await handleVoiceSessionRequest(request({ mode: "hold" }))).status).toBe(402);
  expect(mocks.createRoom).not.toHaveBeenCalled();
});
const request = (body: unknown, method = "POST") =>
  new Request("https://test/api/voice/session", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
it("requires authentication before allocating a room", async () => {
  mocks.session.mockResolvedValue(null);
  expect(
    (await handleVoiceSessionRequest(request({ mode: "hold" }))).status,
  ).toBe(401);
  expect(mocks.createRoom).not.toHaveBeenCalled();
});
it("creates a private room, dispatches the agent, and signs only the server identity", async () => {
  const response = await handleVoiceSessionRequest(
    request({ mode: "hands-free" }),
  );
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({
    serverUrl: "wss://voice.test",
    token: "signed-token",
    participantIdentity: "user-one",
    mode: "hands-free",
  });
  expect(mocks.createRoom).toHaveBeenCalledWith(
    expect.objectContaining({
      name: data.roomName,
      maxParticipants: 2,
      emptyTimeout: 60,
    }),
  );
  expect(mocks.dispatch).toHaveBeenCalledWith(data.roomName, "codaloud-voice", {
    metadata: JSON.stringify({
      participantIdentity: "user-one",
      speechEnabled: true,
      voiceId: "JBFqnCBsd6RMkjVDRZzb",
      mode: "hands-free",
    }),
  });
  expect(mocks.token).toHaveBeenCalledWith(data.roomName, "user-one");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("rejects invalid modes without provisioning", async () => {
  expect(
    (await handleVoiceSessionRequest(request({ mode: "other" }))).status,
  ).toBe(400);
  expect(mocks.createRoom).not.toHaveBeenCalled();
});
it("cleans up an allocated room if dispatch fails and hides provider errors", async () => {
  mocks.dispatch.mockRejectedValue(new Error("secret-provider-detail"));
  const response = await handleVoiceSessionRequest(request({ mode: "hold" }));
  expect(response.status).toBe(503);
  expect(mocks.deleteRoom).toHaveBeenCalledOnce();
  expect(await response.text()).not.toContain("secret-provider-detail");
});
it("only allows closing rooms owned by the current user", async () => {
  const opened = await (
    await handleVoiceSessionRequest(request({ mode: "hold" }))
  ).json();
  expect(
    (
      await handleVoiceSessionRequest(
        request({ roomName: opened.roomName }, "DELETE"),
      )
    ).status,
  ).toBe(204);
  mocks.deleteRoom.mockClear();
  expect(
    (
      await handleVoiceSessionRequest(
        request({ roomName: "voice-other-user-room" }, "DELETE"),
      )
    ).status,
  ).toBe(403);
  expect(mocks.deleteRoom).not.toHaveBeenCalled();
});
it("dispatches validated user speech preferences and rejects unlisted voices", async () => {
  const response = await handleVoiceSessionRequest(
    request({
      mode: "hold",
      speechEnabled: false,
      voiceId: "SAz9YHcvj6GT2YYXdXww",
    }),
  );
  expect(response.status).toBe(200);
  expect(JSON.parse(mocks.dispatch.mock.calls[0][2].metadata)).toMatchObject({
    speechEnabled: false,
    voiceId: "SAz9YHcvj6GT2YYXdXww",
  });
  mocks.createRoom.mockClear();
  expect(
    (
      await handleVoiceSessionRequest(
        request({ mode: "hold", voiceId: "unlisted" }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.createRoom).not.toHaveBeenCalled();
});
it("recovers a transient authentication lookup failure before creating exactly one room", async () => {
  mocks.session.mockRejectedValueOnce(
    Object.assign(new Error("Database unavailable"), { code: "ETIMEDOUT" }),
  );
  const response = await handleVoiceSessionRequest(
    request({ mode: "hands-free" }),
  );
  expect(response.status).toBe(200);
  expect(mocks.session).toHaveBeenCalledTimes(2);
  expect(mocks.createRoom).toHaveBeenCalledOnce();
});
it("bounds authentication retries and never allocates a room when authentication stays unavailable", async () => {
  mocks.session.mockRejectedValue(new Error("Database unavailable"));
  const response = await handleVoiceSessionRequest(
    request({ mode: "hands-free" }),
  );
  expect(response.status).toBe(503);
  expect(mocks.session).toHaveBeenCalledTimes(2);
  expect(mocks.createRoom).not.toHaveBeenCalled();
});
