import { useEffect, useSyncExternalStore } from "react";
import { migrateDatabase } from "@/db/migrate";
import { createOnboardingState } from "../onboarding-state";
import { onboardingStorage } from "../storage";

// Keep project screens behind database initialization, independently of onboarding.
const state = createOnboardingState({
  ...onboardingStorage,
  load: async () => {
    await migrateDatabase();
    return onboardingStorage.load();
  },
});

export const useOnboarding = () => {
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot);
  useEffect(() => {
    void state.load();
  }, []);
  return { ...snapshot, retry: state.load, complete: state.complete };
};
