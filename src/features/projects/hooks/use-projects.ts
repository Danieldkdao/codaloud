import { useInfiniteQuery } from "@tanstack/react-query";

import { readUserProjectsAction } from "@/features/projects/actions/actions";
import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "@/features/projects/lib/project-params";
import { useAuthSession } from "@/hooks/use-auth-session";

export const useProjects = (filters: Partial<ProjectParamsSchema> = {}) => {
  const session = useAuthSession();
  const userId = !session.isPending && !session.error
    ? session.data?.user.id ?? null
    : null;

  const params = projectParamsSchema.parse(filters);

  return useInfiniteQuery({
    queryKey: ["projects", "infinite", userId, params],
    enabled: Boolean(userId),
    initialPageParam: params.page,
    queryFn: async ({ pageParam, signal }) => {
      if (!userId) throw new Error("You must be signed in to view your projects.");

      const userProjects = await readUserProjectsAction({ ...params, page: pageParam }, signal);
      signal.throwIfAborted();

      // Read actions return null on failure; queries must reject to expose an error.
      if (userProjects === null) throw new Error("Unable to load projects. Please try again.");

      return userProjects;
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length < params.pageSize ? undefined : lastPageParam + 1,
  });
};
