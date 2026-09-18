import { isValidIds } from "@/lib/utils";

export class ProjectGitError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "ProjectGitError";
  }
}

export class ProjectGitRequestError extends ProjectGitError {
  readonly retryAfterMs: number;
  constructor(readonly status: number, retryAfter: string | null, code?: string) {
    super("Unable to load project Git data. Please try again.", code);
    this.name = "ProjectGitRequestError";
    const seconds = Number(retryAfter);
    this.retryAfterMs = Number.isFinite(seconds) && seconds > 0
      ? Math.min(Math.max(seconds * 1000, 1000), 30_000)
      : code === "WORKSPACE_RESTORING" ? 3000 : 0;
  }
}

export const requireProjectGitSession = (userId: string | null, projectId: string | null | undefined) => {
  if (!userId) throw new ProjectGitError("Sign in to use project Git.", "UNAUTHENTICATED");
  if (!projectId || !isValidIds(projectId)) throw new ProjectGitError("Invalid project ID.", "INVALID_PROJECT");
  return projectId;
};
