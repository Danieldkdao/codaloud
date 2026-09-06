import { authClient } from "@/lib/auth/auth-client";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState, useTransition } from "react";
import { Platform } from "react-native";

export const useGitHubConnected = (callbackURL = "/account") => {
  const { error: callbackError } = useLocalSearchParams<{ error?: string }>();
  const authorizationFailed = Boolean(callbackError);
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("Checking GitHub permissions…");

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

        // Web reloads at the callback; native resolves after the browser closes.
        if (Platform.OS !== "web") await refreshConnection(undefined, true);
      } catch {
        setStatus("Unable to connect GitHub. Please try again.");
      }
    });
  }, [callbackURL, refreshConnection, startTransition]);

  return {
    isConnected,
    isPending,
    isChecking,
    status,
    handleConnect,
    refreshConnection,
  };
};
