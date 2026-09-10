import { confirmUserProjectOwnership } from "./projects";
import { createSandboxFile, readSandboxFiles } from "@/services/daytona/filesystem";
import { SandboxFilesError } from "@/services/daytona/api";
import type { CreateProjectFileSchema } from "@/features/projects/actions/file-schemas";

const getProjectFilesystem = async (userId: string, projectId: string) => {
  const existingProject = await confirmUserProjectOwnership(userId, projectId);
  if (!existingProject) throw new SandboxFilesError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (existingProject.deletionRequested) throw new SandboxFilesError(409, "PROJECT_DELETING", "This project is being deleted.");
  if (existingProject.setupStatus !== "ready" || !existingProject.sandboxId) {
    throw new SandboxFilesError(409, "WORKSPACE_NOT_READY", "Your workspace is not ready yet. Please try again shortly.");
  }
  return { projectId: existingProject.id, sandboxId: existingProject.sandboxId, allowInitialize: !existingProject.githubRepositoryId };
};

// Server tools can reuse these same operations with their verified user context.
export const readUserProjectFiles = async (userId: string, projectId: string, path: string) =>
  readSandboxFiles(await getProjectFilesystem(userId, projectId), path);

export const createUserProjectFile = async (userId: string, projectId: string, input: CreateProjectFileSchema) =>
  createSandboxFile(await getProjectFilesystem(userId, projectId), input);
