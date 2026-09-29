import { useQuery } from "@tanstack/react-query";

import { readDraftAction } from "@/features/drafts/actions/draft-actions";

export const useDraft = (draftId: string | null) => {
  return useQuery({
    queryKey: ["drafts", "detail", draftId],
    enabled: Boolean(draftId),
    networkMode: "always",
    // Drafts are read from SQLite on device, so a failed read is retried by the user.
    retry: false,
    queryFn: async ({ signal }) => {
      const existingDraft = await readDraftAction(draftId as string, signal);

      if (existingDraft === null)
        throw new Error("Unable to load this draft. Please try again.");

      return existingDraft;
    },
  });
};
