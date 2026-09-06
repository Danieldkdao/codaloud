import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusManager, onlineManager } from "@tanstack/react-query";
import type { NetworkState } from "expo-network";
import type { AppStateStatus } from "react-native";

const mocks = vi.hoisted(() => ({
  platform: { OS: "ios" },
  appState: { currentState: "active", addEventListener: vi.fn() },
  getNetworkStateAsync: vi.fn(),
  addNetworkStateListener: vi.fn(),
  removeNetwork: vi.fn(),
  removeAppState: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: mocks.platform,
  AppState: mocks.appState,
}));
vi.mock("expo-network", () => ({
  getNetworkStateAsync: mocks.getNetworkStateAsync,
  addNetworkStateListener: mocks.addNetworkStateListener,
}));

import { createQueryClient } from "@/lib/query-client";
import { subscribeToQueryLifecycle } from "@/lib/query-lifecycle";

let cleanup: (() => void) | undefined;
let networkChanged: (state: NetworkState) => void;
let appStateChanged: (state: AppStateStatus) => void;

beforeEach(() => {
  mocks.platform.OS = "ios";
  mocks.appState.currentState = "active";
  mocks.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
  mocks.addNetworkStateListener.mockImplementation((listener) => {
    networkChanged = listener;
    return { remove: mocks.removeNetwork };
  });
  mocks.appState.addEventListener.mockImplementation((_event, listener) => {
    appStateChanged = listener;
    return { remove: mocks.removeAppState };
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

describe("query client", () => {
  it("reuses fresh data and isolates caches between client instances", async () => {
    const first = createQueryClient();
    const second = createQueryClient();
    const queryFn = vi.fn().mockResolvedValue(["private-repo"]);
    const options = { queryKey: ["repositories"], queryFn };

    try {
      await first.fetchQuery(options);
      await first.fetchQuery(options);
      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(second.getQueryData(options.queryKey)).toBeUndefined();
    } finally {
      first.clear();
      second.clear();
    }
  });

  it.each([400, 401, 403, 404, 429])("does not retry HTTP %i", async (status) => {
    const client = createQueryClient();
    const error = Object.assign(new Error("Request failed"), { status });
    const queryFn = vi.fn().mockRejectedValue(error);
    try {
      await expect(client.fetchQuery({ queryKey: ["failed"], queryFn, retryDelay: 0 }))
        .rejects.toBe(error);
      expect(queryFn).toHaveBeenCalledTimes(1);
    } finally {
      client.clear();
    }
  });

  it("retries transient failures twice", async () => {
    const client = createQueryClient();
    const error = Object.assign(new Error("Unavailable"), { status: 503 });
    const queryFn = vi.fn().mockRejectedValue(error);
    try {
      await expect(client.fetchQuery({ queryKey: ["failed"], queryFn, retryDelay: 0 }))
        .rejects.toBe(error);
      expect(queryFn).toHaveBeenCalledTimes(3);
    } finally {
      client.clear();
    }
  });

  it("clears cached data and aborts in-flight queries during teardown", async () => {
    const client = createQueryClient();
    let signal: AbortSignal | undefined;
    client.setQueryData(["cached"], "private-data");
    const pending = client.fetchQuery({
      queryKey: ["pending"],
      queryFn: (context) => {
        signal = context.signal;
        return new Promise(() => {});
      },
    });
    const rejection = expect(pending).rejects.toThrow();
    client.clear();
    await rejection;
    expect(signal?.aborted).toBe(true);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("native query lifecycle", () => {
  it("tracks connectivity, internet reachability, and foreground state", async () => {
    mocks.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    cleanup = subscribeToQueryLifecycle();
    await Promise.resolve();
    expect(onlineManager.isOnline()).toBe(false);
    networkChanged({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    networkChanged({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    appStateChanged("background");
    expect(focusManager.isFocused()).toBe(false);
    appStateChanged("active");
    expect(focusManager.isFocused()).toBe(true);
  });

  it("ignores a stale initial connection read after a newer event", async () => {
    let resolve!: (state: NetworkState) => void;
    mocks.getNetworkStateAsync.mockReturnValue(new Promise<NetworkState>((done) => { resolve = done; }));
    cleanup = subscribeToQueryLifecycle();
    networkChanged({ isConnected: false });
    resolve({ isConnected: true });
    await Promise.resolve();
    expect(onlineManager.isOnline()).toBe(false);
  });

  it("removes subscriptions and ignores late initial reads on unmount", async () => {
    let resolve!: (state: NetworkState) => void;
    mocks.getNetworkStateAsync.mockReturnValue(new Promise<NetworkState>((done) => { resolve = done; }));
    const unsubscribe = subscribeToQueryLifecycle();
    unsubscribe?.();
    resolve({ isConnected: false });
    await Promise.resolve();
    expect(onlineManager.isOnline()).toBe(true);
    expect(mocks.removeNetwork).toHaveBeenCalledOnce();
    expect(mocks.removeAppState).toHaveBeenCalledOnce();
  });

  it("keeps requests available when the connectivity check fails", async () => {
    mocks.getNetworkStateAsync.mockRejectedValue(new Error("Unavailable"));
    cleanup = subscribeToQueryLifecycle();
    await Promise.resolve();
    await Promise.resolve();
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("leaves browser lifecycle handling to TanStack Query", () => {
    mocks.platform.OS = "web";
    cleanup = subscribeToQueryLifecycle();
    expect(mocks.addNetworkStateListener).not.toHaveBeenCalled();
    expect(mocks.appState.addEventListener).not.toHaveBeenCalled();
    expect(mocks.getNetworkStateAsync).not.toHaveBeenCalled();
  });
});
