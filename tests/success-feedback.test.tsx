// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SuccessFeedbackProvider, useSuccessFeedback } from "@/hooks/use-success-feedback";

const mocks = vi.hoisted(() => ({
  haptic: vi.fn(), announce: vi.fn(), screenReader: vi.fn(), timeout: vi.fn(),
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: mocks.haptic, performAndroidHapticsAsync: mocks.haptic,
  NotificationFeedbackType: { Success: "success" }, AndroidHaptics: { Confirm: "confirm" },
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isScreenReaderEnabled: mocks.screenReader,
    getRecommendedTimeoutMillis: mocks.timeout,
    announceForAccessibility: mocks.announce,
    announceForAccessibilityWithOptions: mocks.announce,
  },
}));
vi.mock("@/components/ui/success-banner", () => ({
  SuccessBanner: ({ message, visible, onDismiss }: { message: string; visible: boolean; onDismiss: () => void }) =>
    createElement("button", { onClick: onDismiss, "data-visible": visible }, message),
}));

let root: Root;
let container: HTMLDivElement;
let showSuccess: (message: string) => void;
const Consumer = () => { showSuccess = useSuccessFeedback(); return createElement("span", null, "App content"); };
const render = (children: ReactNode = createElement(Consumer)) => {
  act(() => root.render(createElement(SuccessFeedbackProvider, null, children)));
};
const show = async (message: string) => { await act(async () => showSuccess(message)); };
const advance = async (milliseconds: number) => { await act(async () => vi.advanceTimersByTimeAsync(milliseconds)); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("EXPO_OS", "ios");
  mocks.haptic.mockResolvedValue(undefined);
  mocks.screenReader.mockResolvedValue(false);
  mocks.timeout.mockImplementation(async (duration) => duration);
  container = document.createElement("div");
  root = createRoot(container);
  render();
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllEnvs(); });

it("shows one success with a haptic and announcement, then animates out before removing it", async () => {
  await show("Project created");
  expect(container.textContent).toContain("App contentProject created");
  expect(mocks.haptic).toHaveBeenCalledOnce();
  expect(mocks.announce).toHaveBeenCalledWith("Project created", { queue: true });
  await advance(3200);
  expect(container.querySelector("button")?.dataset.visible).toBe("false");
  await advance(220);
  expect(container.querySelector("button")).toBeNull();
});

it("replaces an older success and resets its timeout, including repeated identical messages", async () => {
  await show("Changes saved");
  await advance(3000);
  await show("Changes saved");
  await advance(500);
  expect(container.querySelectorAll("button")).toHaveLength(1);
  expect(container.querySelector("button")?.dataset.visible).toBe("true");
  expect(mocks.haptic).toHaveBeenCalledTimes(2);
  await show("Project deleted");
  expect(container.textContent).not.toContain("Changes saved");
  await advance(3200);
  await advance(220);
  expect(container.querySelector("button")).toBeNull();
});

it("lets a user dismiss early without removing the rest of the app", async () => {
  await show("Project created");
  act(() => container.querySelector("button")!.click());
  await advance(220);
  expect(container.textContent).toBe("App content");
});

it("honors Android's accessibility timeout and uses the native confirmation haptic", async () => {
  vi.stubEnv("EXPO_OS", "android");
  mocks.timeout.mockResolvedValue(10000);
  await show("Project deleted");
  expect(mocks.haptic).toHaveBeenCalledWith("confirm");
  await advance(9999);
  expect(container.querySelector("button")?.dataset.visible).toBe("true");
  await advance(1);
  await advance(220);
  expect(container.querySelector("button")).toBeNull();
});

it("gives screen readers extra reading time and tolerates unavailable haptics", async () => {
  mocks.screenReader.mockResolvedValue(true);
  mocks.haptic.mockRejectedValue(new Error("Unavailable"));
  await show("Changes saved");
  await advance(4000);
  expect(container.querySelector("button")?.dataset.visible).toBe("true");
  await advance(2000);
  await advance(220);
  expect(container.querySelector("button")).toBeNull();
});

it("clears timers and ignores old action callbacks after the provider unmounts", async () => {
  await show("Project created");
  const staleShow = showSuccess;
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  act(() => staleShow("Project deleted"));
  await advance(10000);
  expect(mocks.haptic).toHaveBeenCalledOnce();
  expect(container.textContent).toBe("");
});
