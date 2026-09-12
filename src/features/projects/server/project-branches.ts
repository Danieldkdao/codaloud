import { getUserProjectWorkspace } from "./project-workspace";
import { readSandboxBranches } from "@/services/daytona/branches";

export const readUserProjectBranches = async (userId: string, projectId: string) => {
  const workspace = await getUserProjectWorkspace(userId, projectId);
  return readSandboxBranches(workspace.sandboxId, workspace.projectId);
};
