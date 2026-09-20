import Storage from "expo-sqlite/kv-store";
import type { OnboardingStorage } from "./types";

export const onboardingStorage: OnboardingStorage = {
  load: async () => (await Storage.getItem("onboarding-completed")) === "true",
  complete: async () => { await Storage.setItem("onboarding-completed", "true"); },
};
