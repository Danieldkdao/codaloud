import { useMutation, useQueryClient } from "@tanstack/react-query";

import { importProjectFilesAction } from "@/features/projects/actions/import-actions";
import type {
  ImportProjectFilesInput,
  ImportProjectFilesResult,
} from "@/features/projects/actions/import-schemas";

/**
 * Uploads land outside the editor's save loop, so the folder listing, any
 * cached file content, and Git changes all refresh once the copy is verified.
 */
export const useImportProjectFiles = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation<ImportProjectFilesResult, Error, ImportProjectFilesInput>({
    networkMode: "always",
    mutationKey: ["projects", "files", "import", projectId],
    retry: false,
    mutationFn: (input) => importProjectFilesAction(projectId, input),
    onSuccess: async (result) => {
      const imported = result.error ? result.imported ?? [] : result.data.imported;
      if (imported.length === 0 && result.error) return;
      await queryClient.cancelQueries({
        queryKey: ["projects", "files", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["projects", "files", projectId],
      });
      // An upload can replace a file an editor tab already holds open.
      for (const path of imported)
        void queryClient.invalidateQueries({
          queryKey: ["projects", "file", projectId, path],
          exact: true,
        });
      void queryClient.invalidateQueries({
        queryKey: ["projects", "changes", projectId],
      });
    },
  });
};
