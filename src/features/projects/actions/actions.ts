import { randomUUID } from "expo-crypto";
import {
  createProjectSchema,
  type CreateProjectSchema,
  updateProjectSchema,
  type UpdateProjectSchema,
} from "./schemas";
import {
  projectParamsSchema,
  type ProjectParamsSchema,
} from "../lib/project-params";
import type { ProjectPageData, ProjectResponseData } from "../types";
import { getLocalProjects } from "../local/access";
import {
  executeWorkspace,
  LocalWorkspaceError,
} from "@/services/local-workspace/execute";
import { getGitHubAccessToken } from "@/services/github/credentials";
import { verifyGitHubRepositoryAccess } from "@/services/github/server/repositories";
import { z } from "zod";
import {
  prepareProjectSandboxCleanup,
  cancelProjectSandboxCleanup,
  drainProjectSandboxCleanup,
} from "@/features/terminal/actions/sandbox-cleanup";

const failure = (error: unknown) => ({
  error: true as const,
  message:
    error instanceof Error
      ? error.message
      : "Unable to update this local project.",
  code: error instanceof LocalWorkspaceError ? error.code : undefined,
});

export const readProjectAction = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectResponseData | null> => {
  try {
    const id = z.uuid().parse(projectId).toLowerCase();
    const store = await getLocalProjects();
    return signal?.aborted ? null : store.read(id);
  } catch {
    return null;
  }
};

export const readProjectsAction = async (
  params: Partial<ProjectParamsSchema> = {},
  signal?: AbortSignal,
): Promise<ProjectPageData | null> => {
  try {
    const input = projectParamsSchema.parse(params);
    const store = await getLocalProjects();
    return signal?.aborted ? null : store.list(input);
  } catch {
    return null;
  }
};

export const createProjectAction = async (unsafeData: CreateProjectSchema) => {
  try {
    const input = createProjectSchema.parse(unsafeData);
    const store = await getLocalProjects();
    const id = randomUUID();
    if (input.source === "github") {
      const accessToken = await getGitHubAccessToken();
      const repository = await verifyGitHubRepositoryAccess(
        accessToken,
        input.repositoryId,
      );
      await executeWorkspace(id, "clone", {
        url: repository.cloneUrl,
        accessToken,
      });
    } else await executeWorkspace(id, "initialize");
    const now = new Date().toISOString();
    try {
      if (input.source === "upload") {
        const { copyProjectImportItems } = await import("../lib/file-imports");
        const copied = await copyProjectImportItems({
          projectId: id,
          directoryPath: "",
          items: input.items,
          overwrite: false,
        });
        // A half-created workspace is worse than a failed start: nothing lands
        // unless every chosen file copied.
        if (
          copied.failed.length > 0 ||
          copied.imported.length !== input.items.length
        )
          throw new Error(
            copied.failed[0]?.reason ?? "Unable to copy the chosen files.",
          );
      }
      store.insert({
        id,
        name: input.name,
        setupStatus: "ready",
        setupError: null,
        githubRepositoryId:
          input.source === "github" ? input.repositoryId : null,
        lastOpenedFilePath: null,
        lastOpenedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Only this newly created workspace is eligible for rollback.
      await executeWorkspace(id, "archive-project");
      await executeWorkspace(id, "purge-project");
      throw error;
    }
    return {
      error: false as const,
      message: "Project created on this device.",
      projectId: id,
    };
  } catch (error) {
    return failure(error);
  }
};

export const updateProjectAction = async (
  projectId: string,
  unsafeData: UpdateProjectSchema,
) => {
  try {
    const id = z.uuid().parse(projectId).toLowerCase();
    const input = updateProjectSchema.parse(unsafeData);
    const store = await getLocalProjects();
    const updatedProject = store.update(id, input);
    if (!updatedProject) throw new Error("This project is not on this device.");
    return {
      error: false as const,
      message: "Project updated.",
      projectId: id,
    };
  } catch (error) {
    return failure(error);
  }
};

export const deleteProjectAction = async (projectId: string) => {
  try {
    const id = z.uuid().parse(projectId).toLowerCase();
    const store = await getLocalProjects();
    if (!store.read(id)) throw new Error("This project is not on this device.");
    const sandboxId = store.getSandboxId(id);
    const cleanup = sandboxId
      ? await prepareProjectSandboxCleanup(id, sandboxId)
      : null;
    try {
      await executeWorkspace(id, "archive-project");
      try {
        if (!store.remove(id))
          throw new Error("Unable to remove this project.");
      } catch (error) {
        await executeWorkspace(id, "restore-project");
        throw error;
      }
    } catch (error) {
      if (cleanup) cancelProjectSandboxCleanup(cleanup);
      throw error;
    }
    if (cleanup) void drainProjectSandboxCleanup().catch(() => undefined);
    // The rename and metadata removal are complete. Cleanup failure must not
    // invite a second deletion of a project that has already been removed.
    await executeWorkspace(id, "purge-project").catch(() => undefined);
    return {
      error: false as const,
      message: "Project deleted from this device.",
      projectId: id,
    };
  } catch (error) {
    return failure(error);
  }
};
