import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProjectFileAction, deleteProjectFileAction, readProjectFilesAction, updateProjectFileAction } from "@/features/projects/actions/file-actions";
import type { CreateProjectFileSchema, DeleteProjectFileSchema, ProjectFileEntrySchema, UpdateProjectFileSchema } from "@/features/projects/actions/file-schemas";
import { useDeviceWorkspace } from "@/features/workspace/hooks/use-device-workspace";
import { isProjectFilePathWithin } from "@/features/projects/lib/files";

export const useProjectFiles = (
  projectId: string,
  directoryPath: string,
  { enabled = true, verifyOnMount = false }: { enabled?: boolean; verifyOnMount?: boolean } = {},
) => {
  const { workspace } = useDeviceWorkspace();
  const userId = workspace?.ownerId ?? null;
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
    networkMode: "always",
    queryKey: ["projects", "files", userId, projectId, directoryPath],
    enabled: Boolean(userId) && enabled,
    staleTime: verifyOnMount ? 0 : 5_000,
    refetchOnMount: verifyOnMount ? "always" : true,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!userId) throw new Error("The local workspace is not ready.");
      const files = await readProjectFilesAction(projectId, directoryPath, signal);
      if (files === null) throw new Error("Unable to read this folder on the device. Please try again.");
      return files;
    },
  });

  const creation = useMutation({
    networkMode: "always",
    mutationKey: ["projects", "files", "create", userId, projectId],
    retry: false,
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: CreateProjectFileSchema) => {
      if (!userId) throw new Error("The local workspace is not ready.");
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
    networkMode: "always",
    mutationKey: ["projects", "files", "update", userId, projectId],
    retry: false,
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: UpdateProjectFileSchema) => {
      if (!userId) throw new Error("The local workspace is not ready.");
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true }),
        queryClient.invalidateQueries({
          queryKey: ["projects", "changes", context.userId, context.projectId],
          exact: true,
        }),
      ]);
    },
  });

  const deletion = useMutation({
    networkMode: "always",
    mutationKey: ["projects", "files", "delete", userId, projectId],
    retry: false,
    onMutate: () => ({ userId, projectId }),
    mutationFn: async (input: DeleteProjectFileSchema) => {
      if (!userId) throw new Error("The local workspace is not ready.");
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true }),
        queryClient.invalidateQueries({
          queryKey: ["projects", "changes", context.userId, context.projectId],
          exact: true,
        }),
      ]);
    },
  });

  return { query, creation, update, deletion };
};
