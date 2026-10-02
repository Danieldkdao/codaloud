import { beforeEach, expect, it, vi } from "vitest";
import { handleBillingWebhook } from "../server/billing-webhook";

const mocks = vi.hoisted(() => ({
  grant: vi.fn(),
  refresh: vi.fn(),
  transfer: vi.fn(),
  refund: vi.fn(),
  token: "secret" as string | undefined,
}));
vi.mock("@/data/env/server", () => ({
  serverEnv: {
    get REVENUECAT_WEBHOOK_AUTH_TOKEN() {
      return mocks.token;
    },
  },
}));
vi.mock("../server/billing-service", () => ({
  grantVerifiedTopup: mocks.grant,
  readBillingStatus: mocks.refresh,
  transferPurchasedCredits: mocks.transfer,
  refundVerifiedTopup: mocks.refund,
}));

const request = (token: string, event: unknown) =>
  new Request("https://api.test/api/billing/webhook", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ api_version: "1.0", event }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.token = "secret";
});

it("rejects unsigned and malformed events", async () => {
  const event = {
    id: "evt",
    type: "NON_RENEWING_PURCHASE",
    app_user_id: "38c9f475-a7f8-45b0-9975-e03ace4536a3",
    product_id: "codaloud.credits.100",
    transaction_id: "purchase-1",
    store: "APP_STORE",
  };
  expect((await handleBillingWebhook(request("wrong", event))).status).toBe(
    401,
  );
  expect(
    (
      await handleBillingWebhook(
        request("secret", { ...event, app_user_id: "$RCAnonymousID:abc" }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.grant).not.toHaveBeenCalled();
});

it("grants only known verified top-up events with their event ID as the retry key", async () => {
  const event = {
    id: "evt-100",
    type: "NON_RENEWING_PURCHASE",
    app_user_id: "38c9f475-a7f8-45b0-9975-e03ace4536a3",
    product_id: "codaloud.credits.100",
    transaction_id: "purchase-1",
    store: "APP_STORE",
  };
  expect((await handleBillingWebhook(request("secret", event))).status).toBe(
    200,
  );
  expect(mocks.grant).toHaveBeenCalledWith(
    event.app_user_id,
    event.id,
    100,
    JSON.stringify([event.store, event.transaction_id]),
  );
  expect(
    (
      await handleBillingWebhook(
        request("secret", { ...event, product_id: "unknown" }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.grant).toHaveBeenCalledTimes(1);
});

it("reconciles both sides of a transfer without requiring app_user_id", async () => {
  const previous = "38c9f475-a7f8-45b0-9975-e03ace4536a3";
  const next = "28c9f475-a7f8-45b0-9975-e03ace4536a3";
  const response = await handleBillingWebhook(
    request("secret", {
      id: "evt-transfer",
      type: "TRANSFER",
      transferred_from: [previous, "$RCAnonymousID:old"],
      transferred_to: [next, previous],
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.refresh.mock.calls).toEqual([[previous], [next]]);
  expect(mocks.transfer).toHaveBeenCalledWith("evt-transfer", [previous], next);
  expect(mocks.grant).not.toHaveBeenCalled();
});

it("reverses a refunded top-up using the store transaction identity", async () => {
  const userId = "38c9f475-a7f8-45b0-9975-e03ace4536a3";
  const response = await handleBillingWebhook(
    request("secret", {
      id: "evt-refund",
      type: "CANCELLATION",
      app_user_id: userId,
      product_id: "codaloud.credits.100",
      transaction_id: "purchase-1",
      store: "APP_STORE",
      cancel_reason: "CUSTOMER_SUPPORT",
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.refund).toHaveBeenCalledWith(
    userId,
    "evt-refund",
    100,
    JSON.stringify(["APP_STORE", "purchase-1"]),
  );
  expect(mocks.grant).not.toHaveBeenCalled();
});

it("preserves retries when the transfer destination is ambiguous", async () => {
  const response = await handleBillingWebhook(
    request("secret", {
      id: "evt-ambiguous",
      type: "TRANSFER",
      transferred_from: ["38c9f475-a7f8-45b0-9975-e03ace4536a3"],
      transferred_to: [
        "28c9f475-a7f8-45b0-9975-e03ace4536a3",
        "18c9f475-a7f8-45b0-9975-e03ace4536a3",
      ],
    }),
  );
  expect(response.status).toBe(503);
  expect(mocks.transfer).not.toHaveBeenCalled();
});

it("retains transfer retries when an affected account cannot be reconciled", async () => {
  mocks.refresh.mockRejectedValueOnce(new Error("RevenueCat unavailable"));
  const response = await handleBillingWebhook(
    request("secret", {
      id: "evt-transfer-retry",
      type: "TRANSFER",
      transferred_from: ["38c9f475-a7f8-45b0-9975-e03ace4536a3"],
      transferred_to: ["28c9f475-a7f8-45b0-9975-e03ace4536a3"],
    }),
  );
  expect(response.status).toBe(503);
});

it("accepts the configured webhook token with the Bearer prefix used in RevenueCat", async () => {
  const event = {
    id: "evt-bearer",
    type: "NON_RENEWING_PURCHASE",
    app_user_id: "38c9f475-a7f8-45b0-9975-e03ace4536a3",
    product_id: "codaloud.credits.100",
    transaction_id: "purchase-1",
    store: "APP_STORE",
  };
  const response = await handleBillingWebhook(request("Bearer secret", event));
  expect(response.status).toBe(200);
  expect(mocks.grant).toHaveBeenCalledWith(
    event.app_user_id,
    event.id,
    100,
    JSON.stringify([event.store, event.transaction_id]),
  );
});

it.each(["Bearer secret", "bearer secret", "BEARER secret", "Bearer\tsecret"])(
  "accepts the HTTP Bearer scheme: %s",
  async (token) => {
    expect((await handleBillingWebhook(request(token, {}))).status).toBe(400);
    expect(mocks.grant).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  },
);

it.each([
  "",
  "wrong",
  "Bearer wrong",
  "Bearer",
  "Bearer secret extra",
  "Basic secret",
  "Bearer Bearer secret",
  "Bearer secre",
  "Bearer secreté",
])("rejects missing or mismatched credentials: %s", async (token) => {
  const response = await handleBillingWebhook(request(token, {}));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: "Unauthorized" });
  expect(mocks.grant).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("rejects a missing authorization header", async () => {
  const response = await handleBillingWebhook(
    new Request("https://api.test/api/billing/webhook", {
      method: "POST",
      body: "{}",
    }),
  );
  expect(response.status).toBe(401);
  expect(mocks.grant).not.toHaveBeenCalled();
});

it.each([undefined, ""])(
  "fails closed when the server token is not configured",
  async (token) => {
    mocks.token = token;
    expect(
      (await handleBillingWebhook(request("Bearer secret", {}))).status,
    ).toBe(401);
    expect(mocks.grant).not.toHaveBeenCalled();
  },
);
