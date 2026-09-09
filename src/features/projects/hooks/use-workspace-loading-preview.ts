import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export const useWorkspaceLoadingPreview = () => {
  const [isLoading, setIsLoading] = useState(true);

  // Temporary UI preview while the workspace screens use demo data.
  useFocusEffect(useCallback(() => {
    setIsLoading(true);
    const timeout = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timeout);
  }, []));

  return isLoading;
};
