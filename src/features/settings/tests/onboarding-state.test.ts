import { describe, expect, it, vi } from "vitest";
import { createOnboardingState } from "../onboarding-state";

describe("local onboarding", () => {
  it("loads once without an account or settings row", async () => {
    const load = vi.fn().mockResolvedValue(false);
    const state = createOnboardingState({ load, complete: vi.fn() });
    await Promise.all([state.load(), state.load()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(state.getSnapshot()).toEqual({ ready: true, hasCompletedOnboarding: false, error: null, isCompleting: false });
    await state.load();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries failed startup without treating it as a first launch", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("disk unavailable")).mockResolvedValue(true);
    const state = createOnboardingState({ load, complete: vi.fn() });
    await state.load();
    expect(state.getSnapshot()).toMatchObject({ ready: true, hasCompletedOnboarding: null, error: expect.any(String) });
    await state.load();
    expect(state.getSnapshot()).toMatchObject({ hasCompletedOnboarding: true, error: null });
  });

  it("advances only after a durable write and allows retry after failure", async () => {
    const complete = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const state = createOnboardingState({ load: async () => false, complete });
    await state.load();
    await state.complete();
    expect(state.getSnapshot().hasCompletedOnboarding).toBe(false);
    expect(state.getSnapshot().error).not.toBeNull();
    await state.complete();
    expect(state.getSnapshot()).toMatchObject({ hasCompletedOnboarding: true, error: null });
  });

  it("coalesces repeated completion taps and notifies subscribers", async () => {
    let finish!: () => void;
    const complete = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const state = createOnboardingState({ load: async () => false, complete });
    const listener = vi.fn();
    const unsubscribe = state.subscribe(listener);
    await state.load();
    const first = state.complete();
    const second = state.complete();
    expect(state.getSnapshot().isCompleting).toBe(true);
    expect(state.getSnapshot().hasCompletedOnboarding).toBe(false);
    finish();
    await Promise.all([first, second]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
