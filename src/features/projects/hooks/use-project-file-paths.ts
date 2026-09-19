import { useQuery } from "@tanstack/react-query";
import { readLocalFilePaths } from "../local/file-paths";

export const useProjectFilePaths = (projectId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["projects", "file-paths", projectId],
    queryFn: ({ signal }) => readLocalFilePaths(projectId, signal),
    enabled,
    networkMode: "always",
    // Refresh on each sheet opening to pick up creates, renames and branch changes.
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
