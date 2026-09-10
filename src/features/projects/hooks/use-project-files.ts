import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProjectFileAction, readProjectFilesAction } from "@/features/projects/actions/file-actions";
import type { CreateProjectFileSchema, ProjectFileEntrySchema } from "@/features/projects/actions/file-schemas";
import { useAuthSession } from "@/hooks/use-auth-session";

export const useProjectFiles = (projectId: string, directoryPath: string) => {
  const session = useAuthSession();
  const userId = !session.isPending && !session.error ? session.data?.user.id ?? null : null;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["projects", "files", userId, projectId, directoryPath],
    enabled: Boolean(userId),
    staleTime: 5_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!userId) throw new Error("Sign in to view project files.");
      const files = await readProjectFilesAction(projectId, directoryPath, signal);
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

  return { query, creation };
};
