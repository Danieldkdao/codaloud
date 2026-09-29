import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteDraftAction } from "@/features/drafts/actions/draft-actions";

export const useDeleteDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationKey: ["drafts", "delete"],
    retry: false,
    mutationFn: async (draftId: string) => {
      const deletedDraft = await deleteDraftAction(draftId);
      if (deletedDraft.error) throw new Error(deletedDraft.message);
      return draftId;
    },
    onSuccess: async (draftId) => {
      queryClient.removeQueries({
        queryKey: ["drafts", "detail", draftId],
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["drafts", "infinite"] });
    },
  });
};
