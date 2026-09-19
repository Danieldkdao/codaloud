import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectGitHub } from "../authorization";
import { disconnectGitHub, loadGitHubConnection } from "../credentials";
import { useGitHubProfile } from "./use-github-profile";

export const useGitHubConnected = (_callbackURL = "/account") => {
  const queryClient = useQueryClient();
  const connection = useGitHubProfile();
  const [isPending, startTransition] = useTransition();
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const isConnected = Boolean(
    connection.profile && connection.scopes.includes("repo"),
  );
  const clearGitHubQueries = async () => {
    await queryClient.cancelQueries({ queryKey: ["github"] });
    queryClient.removeQueries({ queryKey: ["github"] });
  };
  const handleConnect = () => {
    setConnectionError(null);
    startTransition(async () => {
      try {
        if (await connectGitHub()) {
          await queryClient.cancelQueries({ queryKey: ["github"] });
          // Reset notifies mounted pickers and refetches them with the saved
          // connection. Removing an active query leaves its observer stranded.
          await queryClient.resetQueries({ queryKey: ["github"] });
        }
      } catch (error) {
        setConnectionError(
          error instanceof Error
            ? error.message
            : "Unable to connect GitHub. Please try again.",
        );
      }
    });
  };
  const handleDisconnect = () => {
    setConnectionError(null);
    startTransition(async () => {
      try {
        await disconnectGitHub();
        await clearGitHubQueries();
      } catch {
        setConnectionError(
          "Unable to remove the GitHub connection. Please try again.",
        );
      }
    });
  };
  return {
    isConnected,
    isPending,
    isChecking: !connection.ready,
    connectionError,
    status:
      connectionError ??
      connection.error ??
      (isPending
        ? "Updating GitHub connection…"
        : isConnected
          ? "GitHub connected. Repository permission granted."
          : null),
    handleConnect,
    handleDisconnect,
    refreshConnection: loadGitHubConnection,
  };
};
