export type OnboardingSnapshot = {
  ready: boolean;
  hasCompletedOnboarding: boolean | null;
  error: string | null;
  isCompleting: boolean;
};

export type OnboardingStorage = {
  load: () => Promise<boolean>;
  complete: () => Promise<void>;
};
