import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";

export const subscribeToQueryLifecycle = () => {
  let disposed = false;
  let receivedNetworkEvent = false;
  const updateNetworkState = (state: Network.NetworkState) => {
    // An unknown connection should not leave requests paused indefinitely.
    onlineManager.setOnline(
      state.isConnected !== false && state.isInternetReachable !== false,
    );
  };

  const networkSubscription = Network.addNetworkStateListener((state) => {
    if (disposed) return;
    receivedNetworkEvent = true;
    updateNetworkState(state);
  });

  void Network.getNetworkStateAsync()
    .then((state) => {
      // A slow initial read must not overwrite a newer connectivity event.
      if (!disposed && !receivedNetworkEvent) updateNetworkState(state);
    })
    .catch(() => {
      // Keep requests available if the initial connectivity check fails.
    });

  if (AppState.currentState !== null) {
    focusManager.setFocused(AppState.currentState === "active");
  }
  const appStateSubscription = AppState.addEventListener("change", (state) => {
    if (!disposed) focusManager.setFocused(state === "active");
  });

  return () => {
    disposed = true;
    networkSubscription.remove();
    appStateSubscription.remove();
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  };
};
