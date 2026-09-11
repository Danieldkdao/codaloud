import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProjectFileAction, deleteProjectFileAction, readProjectFilesAction, updateProjectFileAction } from "@/features/projects/actions/file-actions";
import type { CreateProjectFileSchema, DeleteProjectFileSchema, ProjectFileEntrySchema, UpdateProjectFileSchema } from "@/features/projects/actions/file-schemas";
import { useAuthSession } from "@/hooks/use-auth-session";
import { isProjectFilePathWithin } from "@/features/projects/lib/files";

class WorkspaceRestoringError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Your workspace is still restoring. Please try again shortly.");
    this.name = "WorkspaceRestoringError";
  }
}

export const useProjectFiles = (
  projectId: string,
  directoryPath: string,
  { enabled = true, verifyOnMount = false }: { enabled?: boolean; verifyOnMount?: boolean } = {},
) => {
  const session = useAuthSession();
  const userId = !session.isPending && !session.error ? session.data?.user.id ?? null : null;
  const queryClient = useQueryClient();
  const clearFileContents = async (userId: string | null, projectId: string, paths: readonly string[]) => {
    const contentQueries = {
      queryKey: ["projects", "file", userId, projectId],
      predicate: (query: { queryKey: readonly unknown[] }) => {
        const path = query.queryKey[4];
        return typeof path === "string" && paths.some((root) => isProjectFilePathWithin(path, root));
      },
    };
    // A removed/reused path represents a different document. Invalidation alone
    // can mount the editor with obsolete contents while it refetches in the background.
    await queryClient.cancelQueries(contentQueries);
    queryClient.removeQueries(contentQueries);
  };
  const query = useQuery({
    queryKey: ["projects", "files", userId, projectId, directoryPath],
    enabled: Boolean(userId) && enabled,
    // The workspace gate must check Daytona again on entry, including when
    // setup finishes after this observer mounts. Cached files do not prove readiness.
    staleTime: verifyOnMount ? 0 : 5_000,
    refetchOnMount: verifyOnMount ? "always" : true,
    retry: (failureCount, error) => error instanceof WorkspaceRestoringError && failureCount < 20,
    retryDelay: (_attempt, error) => error instanceof WorkspaceRestoringError ? error.retryAfterMs : 0,
    queryFn: async ({ signal }) => {
      if (!userId) throw new Error("Sign in to view project files.");
      let restoringError: WorkspaceRestoringError | undefined;
      const files = await readProjectFilesAction(projectId, directoryPath, signal, (retryAfter) => {
        const seconds = Number(retryAfter);
        const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3000;
        restoringError = new WorkspaceRestoringError(Math.min(Math.max(delay, 1000), 30_000));
      });
      if (files === null && restoringError) throw restoringError;
      if (files === null) throw new Error("Unable to load this folder. Your workspace may still be restoring. Please try again.");
      return files;
    },
  });

  const creation = useMutation({
    mutationKey: ["projects", "files", "create", userId, projectId],
    retry: false,
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: CreateProjectFileSchema) => {
      if (!userId) throw new Error("Sign in to create files.");
      const result = await createProjectFileAction(projectId, input);
      if (result.error) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async (entry, input, context) => {
      // Target the submitted folder and account, even if navigation changed.
      await clearFileContents(context.userId, context.projectId, [entry.path]);
      const queryKey = ["projects", "files", context.userId, context.projectId, input.parentPath];
      queryClient.setQueryData<ProjectFileEntrySchema[]>(queryKey, (files) =>
        files ? [...files.filter((file) => file.path !== entry.path), entry] : undefined,
      );
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });

  const update = useMutation({
    mutationKey: ["projects", "files", "update", userId, projectId],
    retry: false,
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: UpdateProjectFileSchema) => {
      if (!userId) throw new Error("Sign in to update files.");
      const result = await updateProjectFileAction(projectId, input);
      if (result.error) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async (entry, input, context) => {
      const projectKey = ["projects", "files", context.userId, context.projectId];
      const queryKey = [...projectKey, input.parentPath];
      const previousPath = [input.parentPath, input.previousName].filter(Boolean).join("/");
      if (previousPath !== entry.path) await clearFileContents(context.userId, context.projectId, [previousPath, entry.path]);
      // An earlier directory read must not put the old name back after the rename.
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (entry.isDir && previousPath !== entry.path) {
        const subtreeQueries = {
          queryKey: projectKey,
          predicate: (query: { queryKey: readonly unknown[] }) => {
            const path = query.queryKey[4];
            return typeof path === "string" && [previousPath, entry.path].some((root) =>
              isProjectFilePathWithin(path, root),
            );
          },
        };
        // Cached children carry full paths. Fetch them afresh at the new location.
        await queryClient.cancelQueries(subtreeQueries);
        queryClient.removeQueries(subtreeQueries);
      }
      queryClient.setQueryData<ProjectFileEntrySchema[]>(queryKey, (files) =>
        files ? [...files.filter((file) => file.path !== previousPath && file.path !== entry.path), entry] : undefined,
      );
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });

  const deletion = useMutation({
    mutationKey: ["projects", "files", "delete", userId, projectId],
    retry: false,
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: DeleteProjectFileSchema) => {
      if (!userId) throw new Error("Sign in to delete files.");
      const result = await deleteProjectFileAction(projectId, input);
      if (result.error) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async (entry, input, context) => {
      await clearFileContents(context.userId, context.projectId, [entry.path]);
      const projectKey = ["projects", "files", context.userId, context.projectId];
      const queryKey = [...projectKey, input.parentPath];
      // Cancel stale reads before removing the confirmed entry from the cache.
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (entry.isDir) {
        const subtreeQueries = {
          queryKey: projectKey,
          predicate: (query: { queryKey: readonly unknown[] }) => {
            const path = query.queryKey[4];
            return typeof path === "string" && isProjectFilePathWithin(path, entry.path);
          },
        };
        await queryClient.cancelQueries(subtreeQueries);
        queryClient.removeQueries(subtreeQueries);
      }
      queryClient.setQueryData<ProjectFileEntrySchema[]>(queryKey, (files) =>
        files?.filter((file) => file.path !== entry.path),
      );
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });

  return { query, creation, update, deletion };
};
