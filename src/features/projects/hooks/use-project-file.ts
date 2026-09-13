import { useQuery } from "@tanstack/react-query";

import { readProjectFileContentAction } from "@/features/projects/actions/file-actions";
import { useAuthSession } from "@/hooks/use-auth-session";

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
  const session = useAuthSession();
  const userId = !session.isPending && !session.error ? session.data?.user.id ?? null : null;

  return useQuery({
    queryKey: ["projects", "file", userId, projectId, filePath],
    enabled: Boolean(userId && projectId && filePath),
    staleTime: 5_000,
    // Search previews must recheck sandbox bytes even after a recent cached read.
    refetchOnMount: freshOnMount ? "always" : true,
    // Archived workspaces can take longer than a fixed retry budget to start.
    // Keep checking restoration, while surfacing all other failures normally.
    retry: (_failureCount, error) =>
      error instanceof ProjectFileReadError && error.code === "WORKSPACE_RESTORING",
    retryDelay: (_attempt, error) => error instanceof ProjectFileReadError ? error.retryAfterMs : 0,
    queryFn: async ({ signal }) => {
      if (!userId) throw new Error("Sign in to view project files.");
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
