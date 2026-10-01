import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  platform: { OS: "ios" },
  nativeManage: vi.fn(),
  open: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: mocks.platform,
  Linking: { openURL: mocks.open },
}));
vi.mock("@/data/env/client", () => ({ clientEnv: {} }));
vi.mock("react-native-purchases", () => ({
  default: { showManageSubscriptions: mocks.nativeManage },
  PRODUCT_CATEGORY: {},
}));
vi.mock("react-native-purchases-ui", () => ({ default: {} }));
import { manageStoreSubscription } from "../revenuecat-client";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform.OS = "ios";
});
it("opens Apple's native subscription management", async () => {
  await manageStoreSubscription("user");
  expect(mocks.nativeManage).toHaveBeenCalledOnce();
  expect(mocks.open).not.toHaveBeenCalled();
});
it("keeps cancellation available through Apple's page when the native sheet fails", async () => {
  mocks.nativeManage.mockRejectedValue(new Error("offline"));
  await manageStoreSubscription("user");
  expect(mocks.open).toHaveBeenCalledWith(
    "https://apps.apple.com/account/subscriptions",
  );
});
it("offers Google Play management without a RevenueCat configuration", async () => {
  mocks.platform.OS = "android";
  await manageStoreSubscription("user");
  expect(mocks.open).toHaveBeenCalledWith(
    "https://play.google.com/store/account/subscriptions",
  );
  expect(mocks.nativeManage).not.toHaveBeenCalled();
});
