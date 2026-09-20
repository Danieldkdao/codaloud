// @vitest-environment happy-dom
import { act, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectWorkspaceBranchProvider, useProjectWorkspaceBranch } from "../hooks/use-project-workspace-branch";
import type { ProjectBranchCheckoutSchema } from "../actions/branch-schemas";

const scope = vi.hoisted(() => ({ projectId: "project-one" }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ projectId: scope.projectId }) }));
let current: ReturnType<typeof useProjectWorkspaceBranch>;
let root: Root;
let frames: (string | null)[];
const Probe = () => {
  current = useProjectWorkspaceBranch();
  useLayoutEffect(() => { frames.push(current.branch); });
  return null;
};
const render = async () => {
  await act(async () => root.render(<StrictMode><ProjectWorkspaceBranchProvider><Probe /></ProjectWorkspaceBranchProvider></StrictMode>));
};
const deferred = () => {
  let resolve!: (value: ProjectBranchCheckoutSchema) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ProjectBranchCheckoutSchema>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  scope.projectId = "project-one";
  frames = [];
  root = createRoot(document.createElement("div"));
  await render();
  await act(async () => current.setBranch("main"));
  frames = [];
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("keeps the optimistic branch in every committed frame through success and stale reads", async () => {
  const request = deferred();
  await act(async () => current.checkoutBranch("feature", () => request.promise));
  expect(current.branch).toBe("feature");
  expect(current.isCheckingOut).toBe(true);
  await act(async () => current.setBranch("main"));
  await act(async () => request.resolve({ previousBranch: "main", currentBranch: "feature" }));
  expect(current.branch).toBe("feature");
  expect(current.isCheckingOut).toBe(false);
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.every((branch) => branch === "feature")).toBe(true);
});

it("reverts once after a rejected checkout and preserves the actionable error", async () => {
  const request = deferred();
  await act(async () => current.checkoutBranch("feature", () => request.promise));
  await act(async () => request.reject(new Error("Commit or stash your changes. Affected files: app.ts")));
  expect(current.branch).toBe("main");
  expect(current.isCheckingOut).toBe(false);
  expect(current.checkoutError).toContain("Affected files: app.ts");
  const firstRevert = frames.indexOf("main");
  expect(firstRevert).toBeGreaterThan(0);
  expect(frames.slice(firstRevert).every((branch) => branch === "main")).toBe(true);
});

it("rejects same-tick duplicate selection before a disabled picker can render", async () => {
  const request = deferred();
  const checkout = vi.fn(() => request.promise);
  await act(async () => {
    current.checkoutBranch("feature", checkout);
    current.checkoutBranch("other", checkout);
  });
  expect(checkout).toHaveBeenCalledOnce();
  expect(current.branch).toBe("feature");
  await act(async () => request.resolve({ previousBranch: "main", currentBranch: "feature" }));
});

it("does not mutate when selecting the already selected local branch", async () => {
  const checkout = vi.fn();
  await act(async () => current.checkoutBranch("main", checkout));
  expect(checkout).not.toHaveBeenCalled();
  expect(current.isCheckingOut).toBe(false);
});

it("keeps an uncertain checkout blocked until recovery confirms the actual branch", async () => {
  const recovery = deferred();
  const checkout = vi.fn().mockRejectedValue(Object.assign(new Error("Response lost."), { code: "CHECKOUT_OUTCOME_UNKNOWN" }));
  const recover = vi.fn(() => recovery.promise);
  await act(async () => current.checkoutBranch("feature", checkout, recover));
  expect(recover).toHaveBeenCalledOnce();
  expect(current.isCheckingOut).toBe(true);
  await act(async () => current.setBranch("main"));
  expect(current.branch).not.toBe("main");
  await act(async () => recovery.resolve({ previousBranch: "main", currentBranch: "feature" }));
  expect(current.branch).toBe("feature");
  expect(current.isCheckingOut).toBe(false);
  expect(current.checkoutError).toBeNull();
  expect(checkout).toHaveBeenCalledOnce();
});

it("retries only recovery and does not trust stale branch reads after recovery fails", async () => {
  const checkout = vi.fn().mockRejectedValue(Object.assign(new Error("Response lost."), { code: "CHECKOUT_OUTCOME_UNKNOWN" }));
  const recover = vi.fn().mockRejectedValueOnce(new Error("Reconnect to confirm the branch."))
    .mockResolvedValue({ previousBranch: "main", currentBranch: "feature" });
  await act(async () => current.checkoutBranch("feature", checkout, recover));
  expect(current.isCheckingOut).toBe(true);
  expect(current.isCheckoutRecoveryRequired).toBe(true);
  expect(current.branch).toBeNull();
  await act(async () => current.setBranch("main"));
  expect(current.branch).toBeNull();
  expect(current.checkoutError).toContain("Reconnect");
  await act(async () => current.retryCheckoutRecovery());
  expect(recover).toHaveBeenCalledTimes(2);
  expect(checkout).toHaveBeenCalledOnce();
  expect(current.branch).toBe("feature");
  expect(current.isCheckingOut).toBe(false);
});

it.each(["projectId"] as const)("ignores completion from an earlier %s", async (field) => {
  const request = deferred();
  await act(async () => current.checkoutBranch("feature", () => request.promise));
  scope[field] = "another";
  await render();
  await act(async () => current.setBranch("release"));
  await act(async () => request.resolve({ previousBranch: "main", currentBranch: "feature" }));
  expect(current.branch).toBe("release");
  expect(current.isCheckingOut).toBe(false);
});

it("serializes workspace operations and blocks checkout before React rerenders", async () => {
  const request = deferred();
  const checkout = vi.fn();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = current.runWorkspaceOperation("Pulling…", () => request.promise);
    await expect(current.runWorkspaceOperation("Stashing…", checkout)).rejects.toThrow("already");
    current.checkoutBranch("other", checkout);
  });
  expect(checkout).not.toHaveBeenCalled();
  expect(current.isWorkspaceBusy).toBe(true);
  expect(current.workspaceOperation).toBe("Pulling…");
  await act(async () => { request.resolve({ previousBranch: "main", currentBranch: "main" }); await pending; });
  expect(current.isWorkspaceBusy).toBe(false);
});

it("releases the workspace after an operation fails", async () => {
  await act(async () => {
    await expect(current.runWorkspaceOperation("Stashing…", async () => { throw new Error("Offline"); })).rejects.toThrow("Offline");
  });
  expect(current.isWorkspaceBusy).toBe(false);
  expect(current.workspaceOperation).toBeNull();
});

it.each(["project"])("invalidates delayed operation callbacks after changing %s", async (kind) => {
  const previous = current;
  const request = deferred();
  const action = vi.fn();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = previous.runWorkspaceOperation("Saving…", async (assertCurrent) => {
      await request.promise;
      assertCurrent();
      action();
    });
  });
  scope.projectId = "project-two";
  await render();
  await act(async () => {
    request.resolve({ previousBranch: "main", currentBranch: "main" });
    await expect(pending).rejects.toThrow("workspace");
    await expect(previous.runWorkspaceOperation("Old confirmation", action)).rejects.toThrow("workspace");
  });
  expect(action).not.toHaveBeenCalled();
  expect(current.isWorkspaceBusy).toBe(false);
});

it("blocks workspace mutations while a checkout is in progress", async () => {
  const request = deferred();
  await act(async () => current.checkoutBranch("other", () => request.promise));
  await expect(current.runWorkspaceOperation("Discarding…", vi.fn())).rejects.toThrow("already");
  await act(async () => request.resolve({ previousBranch: "main", currentBranch: "other" }));
});
