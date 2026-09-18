import { redirectGitHubOAuthCallback } from "@/services/github/server/oauth";

const handler = async (request: Request) => {
  const localCallback = redirectGitHubOAuthCallback(request);
  if (localCallback) return localCallback;
  // Keep legacy sessions available while existing cloud workspaces are imported.
  const { auth } = await import("@/lib/auth/auth");
  return auth.handler(request);
};

export { handler as GET, handler as POST };
