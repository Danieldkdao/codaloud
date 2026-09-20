import { useQuery } from "@tanstack/react-query";

import {
  projectCommitDetailsParamsSchema,
  type ProjectCommitDetailsParamsSchema,
} from "../actions/commit-details-schemas";
import { readProjectCommitDetailsAction } from "../actions/git-actions";

export const useProjectCommitDetails = (
  projectId: string | null | undefined,
  {
    commitSha,
    source,
    enabled = true,
  }: Partial<Omit<ProjectCommitDetailsParamsSchema, "projectId">> & {
    enabled?: boolean;
  } = {},
) => {
  const params = projectCommitDetailsParamsSchema.safeParse({
    projectId,
    commitSha,
    source,
  });

  return useQuery({
    networkMode: "always",
    queryKey: ["projects", "commit-details", projectId, commitSha, source],
    enabled: enabled && params.success,
    // The read action returns null without HTTP status; let the caller retry explicitly.
    retry: false,
    queryFn: async ({ signal }) => {
      // Manual refetch bypasses enabled, so guard the request here too.
      if (!params.success)
        throw new Error("Invalid project, commit SHA, or source.");

      const { projectId: validatedProjectId, ...input } = params.data;
      const details = await readProjectCommitDetailsAction(
        validatedProjectId,
        input,
        signal,
      );
      if (details === null)
        throw new Error("Unable to load commit details. Please try again.");
      return details;
    },
  });
};
