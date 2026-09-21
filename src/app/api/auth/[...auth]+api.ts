import { redirectGitHubOAuthCallback } from "@/services/github/server/oauth";
import { auth } from "@/services/auth/server/auth";

const handleAuthRequest = (request: Request) =>
  redirectGitHubOAuthCallback(request) ??
  auth.handler(request);

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
