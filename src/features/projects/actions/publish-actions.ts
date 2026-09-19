import { z } from "zod";
import { getGitHubAccessToken } from "@/services/github/credentials";
import {
  createGitHubRepository,
  verifyGitHubRepositoryAccess,
} from "@/services/github/server/repositories";
import {
  executeWorkspace,
  LocalWorkspaceError,
} from "@/services/local-workspace/execute";
import { getLocalProjects, requireLocalProject } from "../local/access";
import { mutateProjectGitRequest } from "../lib/git-requests";
import { gitCountsSchema } from "../server/git-schemas";
import {
  gitPublishedSchema,
  gitPublishSchema,
  projectPublishedSchema,
  publishProjectSchema,
  type PublishProjectSchema,
} from "./publish-schemas";

const publishing = new Set<string>();

export const publishProjectAction = (
  projectId: string,
  unsafeInput: PublishProjectSchema,
) =>
  mutateProjectGitRequest({
    input: publishProjectSchema,
    unsafeInput,
    output: projectPublishedSchema,
    execute: async (input) => {
      const id = z.uuid().parse(projectId).toLowerCase();
      if (publishing.has(id))
        throw new LocalWorkspaceError(
          "GIT_BUSY",
          "This project is already being published.",
        );
      publishing.add(id);
      try {
        const project = await requireLocalProject(id);
        const counts = gitCountsSchema.parse(
          await executeWorkspace(id, "git/counts"),
        );
        if (counts.hasRemote !== false)
          throw new LocalWorkspaceError(
            "REMOTE_ALREADY_CONNECTED",
            counts.hasRemote
              ? "This project already has a remote repository. Use Push to send commits."
              : "Unable to confirm the remote state. Update the app and refresh Git status.",
          );
        if (!counts.currentBranch || !counts.headSha)
          throw new LocalWorkspaceError(
            "PUBLISH_COMMIT_REQUIRED",
            "Check out a local branch and create a commit before publishing.",
          );
        let accessToken: string;
        try {
          accessToken = await getGitHubAccessToken();
        } catch {
          throw new LocalWorkspaceError(
            "GITHUB_RECONNECT_REQUIRED",
            "Connect GitHub before publishing.",
          );
        }

        let repository;
        try {
          // A recorded ID without a remote is an interrupted publication. Never
          // claim an arbitrary existing repository after a duplicate-name error.
          repository = project.githubRepositoryId
            ? await verifyGitHubRepositoryAccess(
                accessToken,
                project.githubRepositoryId,
              )
            : await createGitHubRepository(accessToken, input);
        } catch (error) {
          const status =
            error && typeof error === "object" && "status" in error
              ? error.status
              : undefined;
          throw new LocalWorkspaceError(
            status === 401
              ? "GITHUB_RECONNECT_REQUIRED"
              : "GITHUB_CREATE_FAILED",
            status === 422
              ? "GitHub could not create this repository. Check the name; it may already be taken on your account."
              : status === 401
                ? "Reconnect GitHub before publishing."
                : status === 451
                  ? "GitHub cannot create this repository due to legal restrictions on the account."
                  : "Unable to confirm the GitHub repository. Check your connection and GitHub account before retrying.",
          );
        }
        if (
          project.githubRepositoryId &&
          (repository.name !== input.name ||
            repository.private !== input.private ||
            !repository.permissions.push)
        )
          throw new LocalWorkspaceError(
            "PUBLISH_RECOVERY_REQUIRED",
            `This project is already linked to ${repository.fullName} (${repository.private ? "private" : "public"}). Use that name and visibility, with write access, to finish connecting it.`,
          );

        let metadataSaved = false;
        try {
          const store = await getLocalProjects();
          const updatedProject = store.connectGitHub(id, String(repository.id));
          metadataSaved = Boolean(updatedProject);
        } catch {
          // GitHub creation already succeeded. Still connect/push when possible;
          // actual remote state prevents publishing twice if SQLite is unavailable.
        }
        try {
          const args = gitPublishSchema.parse({
            url: repository.cloneUrl,
            expectedBranch: counts.currentBranch,
            expectedHeadSha: counts.headSha,
          });
          const result = gitPublishedSchema.parse(
            await executeWorkspace(id, "git/publish", { ...args, accessToken }),
          );
          const warnings = [
            ...(!result.push
              ? [
                  "Repository connected, but the initial push failed. Use Push to retry.",
                ]
              : []),
            ...(result.push && !result.push.trackingUpdated
              ? [
                  "Commits pushed, but branch tracking could not be saved. Refresh Git status.",
                ]
              : []),
            ...(!metadataSaved
              ? [
                  "The GitHub repository is connected, but its project details could not be saved.",
                ]
              : []),
          ];
          return {
            ...result,
            repositoryId: String(repository.id),
            repositoryUrl: repository.htmlUrl,
            warning: warnings.length ? warnings.join(" ") : null,
          };
        } catch {
          throw new LocalWorkspaceError(
            "PUBLISH_INCOMPLETE",
            `GitHub repository ${repository.fullName} exists, but publishing could not be completed. Refresh Git status. If a remote is connected, use Push; otherwise ${metadataSaved ? "retry with the same name and visibility to finish connecting it" : "check the repository on GitHub before trying to publish again"}.`,
          );
        }
      } finally {
        publishing.delete(id);
      }
    },
  });
