import { useInfiniteQuery } from "@tanstack/react-query";

import { readProjectsAction } from "@/features/projects/actions/actions";
import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";

export const useProjects = (filters: Partial<ProjectParamsSchema> = {}) => {
  const params = projectParamsSchema.parse(filters);

  return useInfiniteQuery({
    queryKey: ["projects", "infinite", "cursor", params],
    networkMode: "always",
    initialPageParam: (params.cursor ?? null) as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const existingProjects = await readProjectsAction(
        { ...params, cursor: pageParam },
        signal,
      );

      // Read actions return null on failure; queries must reject to expose an error.
      if (existingProjects === null)
        throw new Error("Unable to load projects. Please try again.");

      return existingProjects;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.projects.some(
          (project) =>
            project.deletionRequested ||
            project.setupStatus === "pending" ||
            project.setupStatus === "running",
        ),
      )
        ? 3_000
        : false,
    refetchIntervalInBackground: false,
  });
};
