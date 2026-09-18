import { useQuery } from "@tanstack/react-query";

import { readProjectFileContentAction } from "@/features/projects/actions/file-actions";

class ProjectFileReadError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly retryAfterMs: number) {
    super(message);
    this.name = "ProjectFileReadError";
  }
}

export const useProjectFile = (
  projectId: string,
  filePath: string | null,
  { freshOnMount = false }: { freshOnMount?: boolean } = {},
) => {
  return useQuery({
    networkMode: "always",
    queryKey: ["projects", "file", projectId, filePath],
    enabled: Boolean(projectId && filePath),
    staleTime: 5_000,
    // Search previews must recheck local file contents even after a recent cached read.
    refetchOnMount: freshOnMount ? "always" : true,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!projectId || !filePath) throw new Error("Choose a project file to open.");

      let readError: ProjectFileReadError | undefined;
      const file = await readProjectFileContentAction(projectId, filePath, signal, (failure, retryAfter) => {
        const seconds = Number(retryAfter);
        const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3000;
        readError = new ProjectFileReadError(failure.message, failure.code, Math.min(Math.max(delay, 1000), 30_000));
      });

      // The action returns null on failure; rejecting lets Query expose errors and retry restoration.
      if (file === null) throw readError ?? new Error("Unable to load this file. Please try again.");
      return file;
    },
  });
};
