import { beforeEach, expect, it, vi } from "vitest";
import { handleBillingRequest } from "../server/billing-api";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  status: vi.fn(),
  trial: vi.fn(),
  endTrial: vi.fn(),
}));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("../server/billing-service", () => ({
  readBillingStatus: mocks.status,
  beginBillingTrial: mocks.trial,
  endBillingTrial: mocks.endTrial,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ userId: "user-1" });
  mocks.status.mockResolvedValue({ tier: "free", monthlyCredits: 50 });
  mocks.trial.mockResolvedValue({ tier: "tier_1", monthlyCredits: 200 });
});

it("ends only the authenticated user's app trial and returns the reconciled balance", async () => {
  mocks.endTrial.mockResolvedValue({ tier: "free" });
  const response = await handleBillingRequest(
    new Request("https://api.test/api/billing", { method: "DELETE" }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ tier: "free" });
  expect(mocks.endTrial).toHaveBeenCalledWith("user-1");
  mocks.user.mockResolvedValue({ userId: null });
  expect(
    (
      await handleBillingRequest(
        new Request("https://api.test/api/billing", { method: "DELETE" }),
      )
    ).status,
  ).toBe(401);
  expect(mocks.endTrial).toHaveBeenCalledOnce();
});

it("does not pretend an app action canceled a store-managed subscription", async () => {
  mocks.endTrial.mockRejectedValue(
    new Error("Manage this subscription in your app store."),
  );
  const response = await handleBillingRequest(
    new Request("https://api.test/api/billing", { method: "DELETE" }),
  );
  expect(response.status).toBe(409);
});

it("requires account authentication for balance and trial", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect(
    (await handleBillingRequest(new Request("https://api.test/api/billing")))
      .status,
  ).toBe(401);
  expect(
    (
      await handleBillingRequest(
        new Request("https://api.test/api/billing", { method: "POST" }),
      )
    ).status,
  ).toBe(401);
  expect(mocks.status).not.toHaveBeenCalled();
});

it("starts the trial only through an authenticated POST and does not cache balances", async () => {
  const response = await handleBillingRequest(
    new Request("https://api.test/api/billing", { method: "POST" }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.trial).toHaveBeenCalledWith("user-1");
});
