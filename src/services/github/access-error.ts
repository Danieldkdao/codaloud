export class GitHubAccessError extends Error {
  constructor(message: string, readonly code?: "GITHUB_RECONNECT_REQUIRED") {
    super(message);
    this.name = "GitHubAccessError";
  }
}
