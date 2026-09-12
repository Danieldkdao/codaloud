import { getUserProjectWorkspace } from "./project-workspace";
import { readSandboxBranches } from "@/services/daytona/branches";
import { projectBranchPageSchema } from "../actions/branch-schemas";
import { readProjectBranchCursor, type ProjectBranchParamsSchema } from "../lib/branch-params";

export const readUserProjectBranches = async (userId: string, params: ProjectBranchParamsSchema) => {
  const { projectId, search, cursor, pageSize } = params;
  const workspace = await getUserProjectWorkspace(userId, projectId);
  const result = await readSandboxBranches(workspace.sandboxId, workspace.projectId);
  const position = cursor ? readProjectBranchCursor(cursor) : null;

  // Daytona returns the full list. Ordinal name ordering keeps cursor comparisons
  // independent of server locale and offsets that shift when branches are deleted.
  const matches = [...new Set(result.branches)]
    .filter((branch) => branch.toLowerCase().includes(search) && (!position || branch > position.after))
    .sort();
  const branches = matches.slice(0, pageSize);
  const nextCursor = matches.length > pageSize
    ? JSON.stringify({ version: 1, projectId, search, after: branches[branches.length - 1] })
    : null;

  return projectBranchPageSchema.parse({ branches, currentBranch: result.currentBranch, nextCursor });
};
