import { useQuery } from "@tanstack/react-query";

import { readProjectAction } from "@/features/projects/actions/actions";

export const useProject = (projectId: string) => {
  return useQuery({
    queryKey: ["projects", "detail", projectId],
    enabled: Boolean(projectId),
    networkMode: "always",
    staleTime: 0,
    // Read failures lose their HTTP status; let the user retry instead of retrying 4xx responses.
    retry: false,
    queryFn: async ({ signal }) => {
      const existingProject = await readProjectAction(projectId, signal);

      // Read actions return null on failure; queries must reject to expose an error.
      if (existingProject === null) throw new Error("Unable to load project. Please try again.");

      return existingProject;
    },
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      const status = query.state.data?.setupStatus;
      return status === "pending" || status === "running" ? 3_000 : false;
    },
    refetchIntervalInBackground: false,
  });
};
