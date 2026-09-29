import { useMutation, useQueryClient } from "@tanstack/react-query";

import { copyDraftToProjectAction } from "@/features/drafts/actions/copy-draft-actions";
import type { CopyDraftToProjectInput } from "@/features/drafts/actions/draft-schemas";
import type { DraftCopyResult } from "@/features/drafts/types";

/**
 * Copies never throw for expected device failures: the caller must be able to
 * branch on FILE_EXISTS to offer Rename, Replace, or Cancel.
 */
export const useCopyDraft = () => {
  const queryClient = useQueryClient();

  return useMutation<DraftCopyResult, Error, CopyDraftToProjectInput>({
    networkMode: "always",
    mutationKey: ["drafts", "copy"],
    retry: false,
    mutationFn: (input) => copyDraftToProjectAction(input),
    onSuccess: async (result) => {
      if (result.error) return;
      const { projectId, path } = result.data;
      await queryClient.cancelQueries({ queryKey: ["projects", "files", projectId] });
      // A new project file changes both the folder listing and Git status.
      void queryClient.invalidateQueries({
        queryKey: ["projects", "files", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["projects", "file", projectId, path],
      });
      void queryClient.invalidateQueries({
        queryKey: ["projects", "changes", projectId],
      });
    },
  });
};
