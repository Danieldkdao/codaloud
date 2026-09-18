import { useInfiniteQuery } from "@tanstack/react-query";
import { useDeviceWorkspace } from "@/features/workspace/hooks/use-device-workspace";
import { requireLocalProject } from "../local/access";
import { readLocalBranches } from "../local/git-readers";

export const useProjectRemoteBranches = (projectId: string, { search = "", enabled = true } = {}) => {
  const { workspace } = useDeviceWorkspace();
  const normalizedSearch = search.trim().toLowerCase();
  const query = useInfiniteQuery({
    queryKey: ["projects", "branches", "infinite", "cursor", workspace?.ownerId, projectId, "remote", normalizedSearch],
    networkMode: "always", enabled: enabled && Boolean(workspace), retry: false,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const project = await requireLocalProject(projectId);
      signal.throwIfAborted();
      return readLocalBranches(project.id, { projectId: project.id, search: normalizedSearch, cursor: pageParam, pageSize: 50 }, "remote");
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return { ...query,
    loadMore: () => { if (query.hasNextPage && !query.isFetching) return query.fetchNextPage({ cancelRefetch: false }); },
    retry: () => query.isFetchNextPageError ? query.fetchNextPage({ cancelRefetch: false }) : query.refetch(),
  };
};
