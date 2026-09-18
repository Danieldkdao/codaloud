import { redirectGitHubOAuthCallback } from "@/services/github/server/oauth";

// Retain the registered GitHub OAuth callback URL without creating an app session.
export const GET = (request: Request) => redirectGitHubOAuthCallback(request)
  ?? Response.json({ message: "This app does not require an account." }, { status: 404 });
