import { describe, expect, it, vi } from "vitest";
import { createWorkspaceState } from "../state";

const workspace = { ownerId: "device-owner", hasEntered: false };

describe("device workspace entry", () => {
  it("loads once and does not require a remote identity", async () => {
    const load = vi.fn().mockResolvedValue(workspace);
    const state = createWorkspaceState({ load, enter: vi.fn() });
    await Promise.all([state.load(), state.load()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(state.getSnapshot()).toEqual({ ready: true, workspace, error: null, isEntering: false });
  });

  it("keeps storage failures visible and retries without creating an empty workspace", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("disk unavailable")).mockResolvedValue(workspace);
    const state = createWorkspaceState({ load, enter: vi.fn() });
    await state.load();
    expect(state.getSnapshot()).toMatchObject({ ready: true, workspace: null, error: expect.any(String) });
    await state.load();
    expect(state.getSnapshot()).toMatchObject({ workspace, error: null });
  });

  it("enters only after the preference is durable and allows retry after a failed write", async () => {
    const enter = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue({ ...workspace, hasEntered: true });
    const state = createWorkspaceState({ load: async () => workspace, enter });
    await state.load();
    await state.enter();
    expect(state.getSnapshot().workspace?.hasEntered).toBe(false);
    expect(state.getSnapshot().error).not.toBeNull();
    await state.enter();
    expect(state.getSnapshot()).toMatchObject({ workspace: { ...workspace, hasEntered: true }, error: null });
  });

  it("coalesces repeated entry taps while notifying subscribers", async () => {
    let finish!: (value: typeof workspace) => void;
    const enter = vi.fn(() => new Promise<typeof workspace>((resolve) => { finish = resolve; }));
    const state = createWorkspaceState({ load: async () => workspace, enter });
    const listener = vi.fn();
    const unsubscribe = state.subscribe(listener);
    await state.load();
    const first = state.enter();
    const second = state.enter();
    expect(state.getSnapshot().isEntering).toBe(true);
    finish({ ...workspace, hasEntered: true });
    await Promise.all([first, second]);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
