// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  end: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children: ReactNode }) =>
    createElement("main", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, loading }: any) =>
    createElement("button", { onClick: onPress, disabled: loading }, children),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: any) => createElement("span", null, children),
  HeadingText: ({ children }: any) => createElement("span", null, children),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user" } } }) },
}));
vi.mock("@/lib/utils", () => ({
  alert: vi.fn(),
  confirmAction: mocks.confirm,
  cn: () => "",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useLocalSearchParams: () => ({ tab: "subscription" }),
}));
vi.mock("../billing-actions", () => ({
  startBillingTrial: vi.fn(),
  endBillingTrial: mocks.end,
}));
vi.mock("../hooks/use-billing-status", () => ({
  useBillingStatus: () => ({
    data: {
      tier: "tier_1",
      monthlyCredits: 100,
      purchasedCredits: 0,
      monthlyAllowance: 200,
      cycleAnchor: "2026-09-30T00:00:00Z",
      cycleIndex: 0,
      trialUsed: true,
      trialEndsAt: "2026-10-03T00:00:00Z",
      paidThrough: null,
      history: [],
    },
  }),
}));
vi.mock("../revenuecat-client", () => ({
  restoreBillingPurchases: vi.fn(),
  showCustomerCenter: vi.fn(),
  showPlansPaywall: vi.fn(),
  manageStoreSubscription: vi.fn(),
}));
vi.mock("../components/billing-tabs", () => ({
  BillingTabs: () => null,
  BillingTabPanel: ({ children, active }: any) => (active ? children : null),
}));
import { BillingScreen } from "../components/billing-screen";
it("asks for confirmation before ending a trial and leaves it untouched if dismissed", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.end.mockResolvedValue({ tier: "free" });
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<BillingScreen />));
  const cancel = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Cancel trial"),
  )!;
  await act(async () => cancel.click());
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.end).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
  const options = mocks.confirm.mock.calls[0][2];
  expect(options.cancelText).toBe("Keep trial");
  await act(async () => options.onConfirmPress());
  expect(mocks.end).toHaveBeenCalledOnce();
  expect(mocks.invalidate).toHaveBeenCalledWith({
    queryKey: ["billing", "user"],
  });
  await act(async () => root.unmount());
});
