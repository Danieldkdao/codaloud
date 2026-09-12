import { getUserProjectWorkspace } from "./project-workspace";
import { createSandboxFile, deleteSandboxFile, readSandboxFileContent, readSandboxFiles, saveSandboxFileContent, updateSandboxFile } from "@/services/daytona/filesystem";
import type { CreateProjectFileSchema, DeleteProjectFileSchema, SaveProjectFileContentSchema, UpdateProjectFileSchema } from "@/features/projects/actions/file-schemas";
import type { CodeIntelligenceRequestSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { readSandboxCodeIntelligence } from "@/services/daytona/typescript";

// Server tools can reuse these same operations with their verified user context.
export const readUserProjectFiles = async (userId: string, projectId: string, path: string) =>
  readSandboxFiles(await getUserProjectWorkspace(userId, projectId), path);

export const readUserProjectFileContent = async (userId: string, projectId: string, path: string) =>
  readSandboxFileContent(await getUserProjectWorkspace(userId, projectId), path);

export const saveUserProjectFileContent = async (userId: string, projectId: string, input: SaveProjectFileContentSchema) =>
  saveSandboxFileContent(await getUserProjectWorkspace(userId, projectId), input);

export const readUserProjectCodeIntelligence = async (userId: string, projectId: string, input: CodeIntelligenceRequestSchema) =>
  readSandboxCodeIntelligence(await getUserProjectWorkspace(userId, projectId), input);

export const createUserProjectFile = async (userId: string, projectId: string, input: CreateProjectFileSchema) =>
  createSandboxFile(await getUserProjectWorkspace(userId, projectId), input);

export const updateUserProjectFile = async (userId: string, projectId: string, input: UpdateProjectFileSchema) =>
  updateSandboxFile(await getUserProjectWorkspace(userId, projectId), input);

export const deleteUserProjectFile = async (userId: string, projectId: string, input: DeleteProjectFileSchema) =>
  deleteSandboxFile(await getUserProjectWorkspace(userId, projectId), input);
