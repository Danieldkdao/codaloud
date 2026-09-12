import { confirmUserProjectOwnership } from "./projects";
import { SandboxFilesError } from "@/services/daytona/api";

export const getUserProjectWorkspace = async (userId: string, projectId: string) => {
  const existingProject = await confirmUserProjectOwnership(userId, projectId);
  if (!existingProject) throw new SandboxFilesError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (existingProject.deletionRequested) throw new SandboxFilesError(409, "PROJECT_DELETING", "This project is being deleted.");
  if (existingProject.setupStatus !== "ready" || !existingProject.sandboxId) {
    throw new SandboxFilesError(409, "WORKSPACE_NOT_READY", "Your workspace is not ready yet. Please try again shortly.");
  }
  return { projectId: existingProject.id, sandboxId: existingProject.sandboxId, allowInitialize: !existingProject.githubRepositoryId };
};
