import { beforeEach, expect, it, vi } from "vitest";
import { deleteRevenueCatCustomer } from "../delete-revenuecat-customer";

const mocks = vi.hoisted(() => ({ key: "sk_test_secret" }));

vi.mock("@/data/env/server", () => ({
  serverEnv: {
    get REVENUECAT_SECRET_API_KEY() {
      return mocks.key;
    },
  },
}));

beforeEach(() => {
  mocks.key = "sk_test_secret";
  vi.restoreAllMocks();
});

it("requests deletion of the matching RevenueCat customer", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ status: 200 } as Response);
  await deleteRevenueCatCustomer("user/1");
  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.revenuecat.com/v1/subscribers/user%2F1",
    expect.objectContaining({
      method: "DELETE",
      headers: { Authorization: "Bearer sk_test_secret" },
    }),
  );
});

it("accepts an already deleted customer", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ status: 404 } as Response);
  await expect(deleteRevenueCatCustomer("user-1")).resolves.toBeUndefined();
});

it("blocks account deletion when the server has a public SDK key", async () => {
  mocks.key = "test_public";
  const fetchMock = vi.spyOn(globalThis, "fetch");
  await expect(deleteRevenueCatCustomer("user-1")).rejects.toThrow(
    "secret API key",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("blocks account deletion when RevenueCat rejects cleanup", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ status: 401 } as Response);
  await expect(deleteRevenueCatCustomer("user-1")).rejects.toThrow(
    "could not remove",
  );
});
