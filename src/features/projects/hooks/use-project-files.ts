import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProjectFileAction, deleteProjectFileAction, readProjectFilesAction, updateProjectFileAction } from "@/features/projects/actions/file-actions";
import type { CreateProjectFileSchema, DeleteProjectFileSchema, ProjectFileEntrySchema, UpdateProjectFileSchema } from "@/features/projects/actions/file-schemas";
import { useAuthSession } from "@/hooks/use-auth-session";

class WorkspaceRestoringError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Your workspace is still restoring. Please try again shortly.");
    this.name = "WorkspaceRestoringError";
  }
}

export const useProjectFiles = (projectId: string, directoryPath: string) => {
  const session = useAuthSession();
  const userId = !session.isPending && !session.error ? session.data?.user.id ?? null : null;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["projects", "files", userId, projectId, directoryPath],
    enabled: Boolean(userId),
    staleTime: 5_000,
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
      // An earlier directory read must not put the old name back after the rename.
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (entry.isDir && previousPath !== entry.path) {
        const subtreeQueries = {
          queryKey: projectKey,
          predicate: (query: { queryKey: readonly unknown[] }) => {
            const path = query.queryKey[4];
            return typeof path === "string" && [previousPath, entry.path].some((root) =>
              path === root || path.startsWith(`${root}/`),
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
      const projectKey = ["projects", "files", context.userId, context.projectId];
      const queryKey = [...projectKey, input.parentPath];
      // Cancel stale reads before removing the confirmed entry from the cache.
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (entry.isDir) {
        const subtreeQueries = {
          queryKey: projectKey,
          predicate: (query: { queryKey: readonly unknown[] }) => {
            const path = query.queryKey[4];
            return typeof path === "string" && (path === entry.path || path.startsWith(`${entry.path}/`));
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
