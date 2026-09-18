import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("expo-sqlite/kv-store", () => ({ default: storage }));
import { onboardingStorage } from "../storage";

beforeEach(() => vi.resetAllMocks());

it("defaults to onboarding on a fresh installation without inserting anything", async () => {
  storage.getItem.mockResolvedValue(null);
  expect(await onboardingStorage.load()).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it("remembers completion across subsequent loads", async () => {
  storage.getItem.mockResolvedValue(null);
  await onboardingStorage.complete();
  expect(storage.setItem).toHaveBeenCalledWith("onboarding-completed", "true");
  storage.getItem.mockResolvedValue("true");
  expect(await onboardingStorage.load()).toBe(true);
});

it("surfaces storage errors instead of treating them as a fresh install or successful save", async () => {
  storage.getItem.mockRejectedValue(new Error("Unavailable"));
  await expect(onboardingStorage.load()).rejects.toThrow("Unavailable");
  storage.setItem.mockRejectedValue(new Error("Full"));
  await expect(onboardingStorage.complete()).rejects.toThrow("Full");
});
