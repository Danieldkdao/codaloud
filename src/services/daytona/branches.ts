import { Daytona, DaytonaNotFoundError } from "@daytona/sdk";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import { projectBranchesSchema } from "@/features/projects/actions/branch-schemas";
import { ensureSandboxReady, SandboxFilesError } from "./api";

const daytonaBranchesSchema = z.object({
  branches: z.array(z.string().min(1)),
  // Daytona leaves current empty when HEAD is detached.
  current: z.string().optional(),
});
export type DaytonaBranchesSchema = z.infer<typeof daytonaBranchesSchema>;

export const readSandboxBranches = async (sandboxId: string, projectId: string) => {
  try {
    const daytona = new Daytona({
      apiKey: serverEnv.DAYTONA_API_KEY,
      target: serverEnv.DAYTONA_TARGET,
      otelEnabled: false,
      requestTimeoutMs: 15_000,
    });
    const sandbox = await daytona.get(sandboxId).catch((error: unknown) => {
      if (error instanceof DaytonaNotFoundError) {
        throw new SandboxFilesError(409, "SANDBOX_MISSING", "Your saved sandbox could not be found. It has not been replaced.");
      }
      throw error;
    });
    await ensureSandboxReady(sandbox, sandboxId, projectId);
    const home = await sandbox.getUserHomeDir();
    if (!home?.startsWith("/")) throw new Error("Missing sandbox home");

    // Read only the app's cloned workspace; local Git reads need no GitHub token.
    const repositoryPath = `${home.replace(/\/$/, "")}/.codaloud/workspace`;
    const branches = daytonaBranchesSchema.parse(await sandbox.git.branches(repositoryPath));
    return projectBranchesSchema.parse({ branches: branches.branches, currentBranch: branches.current || null });
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    // SDK errors may include credentials or upstream request details.
    throw new SandboxFilesError(502, "DAYTONA_REQUEST_FAILED", "Unable to load project branches. Please try again.");
  }
};
