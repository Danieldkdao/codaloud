import { getGitHubCredentialsForUser } from "./access";
import { verifyGitHubRepositoryAccess } from "./repositories";

// Server-only input comes from the saved project and its setup operation.
// The returned token is for the clone call, never task payloads, results, or logs.
export const getGitHubImportSource = async (
  userId: string,
  accountId: string | null,
  repositoryId: string,
  signal?: AbortSignal,
) => {
  const { accessToken } = await getGitHubCredentialsForUser(userId, accountId);
  const repository = await verifyGitHubRepositoryAccess(accessToken, repositoryId, signal);
  return { repository, accessToken };
};
