import type { OnboardingSnapshot, OnboardingStorage } from "./types";

export const createOnboardingState = (storage: OnboardingStorage) => {
  let snapshot: OnboardingSnapshot = { ready: false, hasCompletedOnboarding: null, error: null, isCompleting: false };
  let loading: Promise<void> | undefined;
  let completing: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: Partial<OnboardingSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load: () => {
      if (snapshot.hasCompletedOnboarding !== null) return Promise.resolve();
      loading ??= (async () => {
        try {
          const hasCompletedOnboarding = await storage.load();
          publish({ ready: true, hasCompletedOnboarding, error: null });
        } catch {
          publish({ ready: true, error: "Unable to load local app data. Please try again." });
        } finally {
          loading = undefined;
        }
      })();
      return loading;
    },
    complete: () => {
      if (snapshot.hasCompletedOnboarding !== false) return Promise.resolve();
      completing ??= (async () => {
        publish({ isCompleting: true, error: null });
        try {
          await storage.complete();
          publish({ hasCompletedOnboarding: true, error: null });
        } catch {
          publish({ error: "Unable to save your preference on this device. Please try again." });
        } finally {
          publish({ isCompleting: false });
          completing = undefined;
        }
      })();
      return completing;
    },
  };
};
