import { authClient } from "@/lib/auth/auth-client";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const useGitHubConnected = (callbackURL = "/account") => {
  const queryClient = useQueryClient();
  const { error: callbackError } = useLocalSearchParams<{ error?: string }>();
  const authorizationFailed = Boolean(callbackError);
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("Checking GitHub permissions…");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const refreshConnection = useCallback(
    async (signal?: AbortSignal, attempted = false) => {
      setIsChecking(true);
      try {
        const { data: accounts, error } = await authClient.listAccounts({
          fetchOptions: { signal },
        });
        if (signal?.aborted) return;
        if (error || !accounts) throw new Error("Unable to check permissions.");

        const hasRepositoryAccess = accounts.some(
          (account) =>
            account.providerId === "github" && account.scopes.includes("repo"),
        );
        setIsConnected(hasRepositoryAccess);
        setStatus(
          hasRepositoryAccess
            ? "GitHub connected. Repository permission granted."
            : attempted || authorizationFailed
              ? "Repository permission wasn’t granted. You can try again."
              : "GitHub repository access is not connected.",
        );
        return hasRepositoryAccess;
      } catch {
        if (!signal?.aborted) {
          setIsConnected(false);
          setStatus("Unable to check GitHub permissions. Please try again.");
        }
      } finally {
        if (!signal?.aborted) setIsChecking(false);
      }
    },
    [authorizationFailed],
  );

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      void refreshConnection(controller.signal);
      return () => controller.abort();
    }, [refreshConnection]),
  );

  const handleConnect = useCallback(() => {
    setConnectionError(null);
    startTransition(async () => {
      setStatus("Waiting for GitHub authorization…");
      try {
        const { error } = await authClient.linkSocial({
          provider: "github",
          scopes: ["repo"],
          callbackURL,
          errorCallbackURL: callbackURL,
        });
        if (error) throw new Error("Unable to connect GitHub.");

        // Authorization resolves after the browser session closes.
        if (await refreshConnection(undefined, true)) {
          // Discard old-account data and rejected queries before loading with the new token.
          await queryClient.resetQueries({ queryKey: ["github", "repositories"] });
        }
      } catch {
        setStatus("Unable to connect GitHub. Please try again.");
        setConnectionError("Unable to connect GitHub. Please try again.");
      }
    });
  }, [callbackURL, queryClient, refreshConnection, startTransition]);

  return {
    isConnected,
    isPending,
    isChecking,
    status,
    connectionError,
    handleConnect,
    refreshConnection,
  };
};
