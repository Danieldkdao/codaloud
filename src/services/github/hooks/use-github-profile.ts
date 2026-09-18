import { useEffect, useSyncExternalStore } from "react";
import { getGitHubConnectionSnapshot, loadGitHubConnection, subscribeToGitHubConnection } from "../credentials";

export const useGitHubProfile = () => {
  const connection = useSyncExternalStore(subscribeToGitHubConnection, getGitHubConnectionSnapshot);
  useEffect(() => { void loadGitHubConnection(); }, []);
  return connection;
};
