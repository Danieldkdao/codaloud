import { z } from "zod";
import { projectBranchesSchema } from "@/features/projects/actions/branch-schemas";
import { getSandboxToolboxUrl, requestDaytona, SandboxFilesError } from "./api";

const daytonaBranchesSchema = z.object({
  branches: z.array(z.string().min(1)),
  // Daytona leaves current empty when HEAD is detached.
  current: z.string().optional(),
});
export type DaytonaBranchesSchema = z.infer<typeof daytonaBranchesSchema>;

export const getSandboxGitRepository = async (sandboxId: string, projectId: string) => {
  // Use the SDK's HTTP endpoints directly: its transitive ESM dependencies
  // fail to initialize when bundled into an Expo API route.
  const toolboxUrl = await getSandboxToolboxUrl(sandboxId, projectId);
  const { dir: home } = z.object({ dir: z.string().startsWith("/") }).parse(
    await requestDaytona(`${toolboxUrl}/user-home-dir`),
  );
  // The repository path always comes from the owned sandbox, never the caller.
  return { toolboxUrl, repositoryPath: `${home.replace(/\/$/, "")}/.codaloud/workspace` };
};

export const readSandboxGitBranches = async (
  { toolboxUrl, repositoryPath }: Awaited<ReturnType<typeof getSandboxGitRepository>>,
  signal?: AbortSignal,
  failureResponse?: (response: Response) => Promise<SandboxFilesError>,
) => {
  const query = new URLSearchParams({ path: repositoryPath });
  const branches = daytonaBranchesSchema.parse(await requestDaytona(`${toolboxUrl}/git/branches?${query}`, { signal }, failureResponse));
  return projectBranchesSchema.parse({ branches: branches.branches, currentBranch: branches.current || null });
};

export const readSandboxBranches = async (sandboxId: string, projectId: string) => {
  try {
    // Local Git reads need no GitHub token.
    return await readSandboxGitBranches(await getSandboxGitRepository(sandboxId, projectId));
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    // Unexpected errors may include credentials or upstream request details.
    throw new SandboxFilesError(502, "DAYTONA_REQUEST_FAILED", "Unable to load project branches. Please try again.");
  }
};
