import {
  checkoutProjectBranchSchema,
  projectBranchCheckoutSchema,
} from "@/features/projects/actions/branch-schemas";
import { checkoutUserProjectBranch } from "@/features/projects/server/project-checkout";
import { createGitRoute } from "@/features/projects/server/git-route";

const checkoutUnavailable = {
  code: "CHECKOUT_UNAVAILABLE",
  message:
    "Unable to prepare the branch switch. Refresh the workspace and try again.",
};

export const POST = createGitRoute({
  input: checkoutProjectBranchSchema,
  output: projectBranchCheckoutSchema,
  mutation: true,
  message: "Branch checked out successfully.",
  errors: {
    input: {
      code: "INVALID_BRANCH",
      message:
        "Send a valid branchName without checkout options or extra fields.",
    },
    unavailable: checkoutUnavailable,
    unknownOutcome: checkoutUnavailable,
  },
  execute: ({ request, params, userId, input }) =>
    checkoutUserProjectBranch(
      userId,
      request.headers,
      params.projectId,
      input,
      request.signal,
    ),
});
