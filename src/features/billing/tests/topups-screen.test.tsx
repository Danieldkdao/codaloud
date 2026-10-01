// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CreditState } from "../billing-rules";

const mocks = vi.hoisted(() => ({
  status: {
    tier: "tier_1",
    paidThrough: null,
    trialEndsAt: "2026-10-03T12:00:00Z",
  } as Pick<CreditState, "tier" | "paidThrough" | "trialEndsAt">,
  read: vi.fn(),
  products: vi.fn(),
  buy: vi.fn(),
  paywall: vi.fn(),
  invalidate: vi.fn(),
  alert: vi.fn(),
  screen: vi.fn(),
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
  Button: ({ children, onPress, loading, disabled }: any) =>
    createElement(
      "button",
      { onClick: onPress, disabled: loading || disabled },
      children,
    ),
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: any) => createElement("span", null, children),
  HeadingText: ({ children }: any) => createElement("span", null, children),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user" } } }) },
}));
vi.mock("@/lib/utils", () => ({ alert: mocks.alert }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  Stack: {
    Screen: (props: any) => {
      mocks.screen(props);
      return null;
    },
  },
}));
vi.mock("../billing-actions", () => ({ readBilling: mocks.read }));
vi.mock("../hooks/use-billing-status", () => ({
  useBillingStatus: () => ({ data: mocks.status }),
}));
vi.mock("../revenuecat-client", () => ({
  getTopupProducts: mocks.products,
  buyTopupProduct: mocks.buy,
  showTopupsPaywall: mocks.paywall,
}));
import { TopupsScreen } from "../components/topups-screen";

let root: Root;
let container: HTMLDivElement;
const product = { identifier: "codaloud.credits.100", priceString: "$2.99" };
const click = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-01T12:00:00Z"));
  mocks.status = {
    tier: "tier_1",
    paidThrough: null,
    trialEndsAt: "2026-10-03T12:00:00Z",
  };
  mocks.read.mockImplementation(async () => mocks.status);
  mocks.products.mockResolvedValue([product]);
  mocks.buy.mockResolvedValue(undefined);
  mocks.paywall.mockResolvedValue(undefined);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
});
it("shows Top Ups and loads credit packs for an active Pro trial", async () => {
  await act(async () => root.render(<TopupsScreen />));
  expect(mocks.screen).toHaveBeenCalledWith(
    expect.objectContaining({ options: { title: "Top Ups" } }),
  );
  expect(mocks.products).toHaveBeenCalledWith("user");
  expect(container.textContent).toContain("Buy for $2.99");
  expect(container.textContent).not.toContain("A paid plan is required");
});
it.each(["free", "expired"])(
  "does not load products for a %s account",
  async (kind) => {
    mocks.status =
      kind === "free"
        ? { tier: "free", paidThrough: null, trialEndsAt: null }
        : {
            tier: "tier_1",
            paidThrough: null,
            trialEndsAt: "2026-10-01T12:00:00Z",
          };
    await act(async () => root.render(<TopupsScreen />));
    expect(mocks.products).not.toHaveBeenCalled();
    expect(container.textContent).toContain("A paid plan is required");
  },
);
it("allows an active trial to buy a credit pack after refreshing billing status", async () => {
  await act(async () => root.render(<TopupsScreen />));
  await click("Buy for $2.99");
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.buy).toHaveBeenCalledWith("user", product);
  expect(mocks.invalidate).toHaveBeenCalledWith({
    queryKey: ["billing", "user"],
  });
});
it("blocks a purchase when the trial has expired since opening the screen", async () => {
  await act(async () => root.render(<TopupsScreen />));
  mocks.read.mockResolvedValue({
    ...mocks.status,
    trialEndsAt: "2026-10-01T12:00:00Z",
  });
  await click("Buy for $2.99");
  expect(mocks.buy).not.toHaveBeenCalled();
  expect(mocks.alert).toHaveBeenCalledWith(expect.stringMatching(/Subscribe/));
});
it("allows an active trial to browse the credit pack paywall", async () => {
  await act(async () => root.render(<TopupsScreen />));
  await click("Browse credit packs");
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.paywall).toHaveBeenCalledWith("user");
});
it("blocks a stale credit pack paywall after returning to Free", async () => {
  await act(async () => root.render(<TopupsScreen />));
  mocks.read.mockResolvedValue({
    ...mocks.status,
    tier: "free",
    trialEndsAt: null,
  });
  await click("Browse credit packs");
  expect(mocks.paywall).not.toHaveBeenCalled();
  expect(mocks.alert).toHaveBeenCalledWith(expect.stringMatching(/Subscribe/));
});
