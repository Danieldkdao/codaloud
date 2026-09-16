import { projectBranchPageSchema } from "@/features/projects/actions/branch-schemas";
import { projectBranchParamsSchema } from "@/features/projects/lib/branch-params";
import { readUserProjectBranches } from "@/features/projects/server/project-branches";
import { createGitRoute } from "@/features/projects/server/git-route";

export const GET = createGitRoute({
  input: projectBranchParamsSchema,
  output: projectBranchPageSchema,
  query: (query, params) => ({
    ...Object.fromEntries(query),
    projectId: params.projectId,
  }),
  message: "Project branches loaded.",
  errors: {
    input: {
      code: "INVALID_BRANCH_PARAMS",
      message: "Invalid branch search or pagination.",
    },
    unavailable: {
      code: "BRANCHES_UNAVAILABLE",
      message: "Unable to load project branches. Please try again.",
    },
  },
  execute: ({ userId, input }) => readUserProjectBranches(userId, input),
});
