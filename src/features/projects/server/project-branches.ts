import { getUserReadyProject } from "./project-workspace";
import { readSandboxBranches } from "@/services/daytona/branches";
import { projectBranchPageSchema } from "../actions/branch-schemas";
import { readProjectBranchCursor, type ProjectBranchParamsSchema } from "../lib/branch-params";
import { getGitHubCredentials } from "@/services/github/server/access";
import { listGitHubRepositoryBranchNames } from "@/services/github/server/repositories";

export const readUserProjectBranches = async (
  userId: string,
  params: ProjectBranchParamsSchema,
  headers: Headers,
  signal?: AbortSignal,
) => {
  const { projectId, search, cursor, pageSize } = params;
  const existingProject = await getUserReadyProject(userId, projectId);
  const result = await readSandboxBranches(existingProject.sandboxId, existingProject.id);
  let remoteBranches: string[] = [];
  if (existingProject.githubRepositoryId) {
    const { accessToken } = await getGitHubCredentials(headers);
    remoteBranches = await listGitHubRepositoryBranchNames(accessToken, existingProject.githubRepositoryId, signal);
  }
  const position = cursor ? readProjectBranchCursor(cursor) : null;

  // Daytona lists local branches; selected-branch clones omit other remote refs.
  // Merge GitHub names before pagination. Ordinal ordering keeps cursor comparisons
  // independent of server locale and offsets that shift when branches are deleted.
  const matches = [...new Set([...result.branches, ...remoteBranches])]
    .filter((branch) => branch.toLowerCase().includes(search) && (!position || branch > position.after))
    .sort();
  const branches = matches.slice(0, pageSize);
  const nextCursor = matches.length > pageSize
    ? JSON.stringify({ version: 1, projectId, search, after: branches[branches.length - 1] })
    : null;

  return projectBranchPageSchema.parse({ branches, currentBranch: result.currentBranch, nextCursor });
};
