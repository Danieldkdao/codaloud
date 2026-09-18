import { useInfiniteQuery } from "@tanstack/react-query";

import { readUserProjectsAction } from "@/features/projects/actions/actions";
import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";
import { useDeviceWorkspace } from "@/features/workspace/hooks/use-device-workspace";

export const useProjects = (filters: Partial<ProjectParamsSchema> = {}) => {
  const { workspace } = useDeviceWorkspace();
  const userId = workspace?.ownerId ?? null;

  const params = projectParamsSchema.parse(filters);

  return useInfiniteQuery({
    queryKey: ["projects", "infinite", "cursor", userId, params],
    enabled: Boolean(userId),
    networkMode: "always",
    initialPageParam: (params.cursor ?? null) as string | null,
    queryFn: async ({ pageParam, signal }) => {
      if (!userId) throw new Error("The local workspace is not ready.");

      const userProjects = await readUserProjectsAction({ ...params, cursor: pageParam }, signal);

      // Read actions return null on failure; queries must reject to expose an error.
      if (userProjects === null) throw new Error("Unable to load projects. Please try again.");

      return userProjects;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: (query) => query.state.data?.pages.some(
      (page) => page.projects.some((project) =>
        project.deletionRequested || project.setupStatus === "pending" || project.setupStatus === "running",
      ),
    ) ? 3_000 : false,
    refetchIntervalInBackground: false,
  });
};
