import { z } from "zod";

export const gitHubOAuthRequestSchema = z.union([
  z.strictObject({ code: z.string().min(1).max(1024), codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/) }),
  z.strictObject({ refreshToken: z.string().min(1).max(2048) }),
]);
export type GitHubOAuthRequestSchema = z.infer<typeof gitHubOAuthRequestSchema>;

export const gitHubOAuthConfigSchema = z.object({ clientId: z.string().min(1), redirectUri: z.url() });
export type GitHubOAuthConfigSchema = z.infer<typeof gitHubOAuthConfigSchema>;

export const gitHubOAuthTokenSchema = z.object({
  accessToken: z.string().min(1), scopes: z.array(z.string()),
  expiresIn: z.number().int().positive().nullable(), refreshToken: z.string().min(1).nullable(),
  refreshTokenExpiresIn: z.number().int().positive().nullable(),
});
export type GitHubOAuthTokenSchema = z.infer<typeof gitHubOAuthTokenSchema>;

export const gitHubProfileSchema = z.object({
  id: z.number().int().positive(), login: z.string().min(1), name: z.string().nullable(),
  email: z.string().nullable(), avatar_url: z.url(),
});
export type GitHubProfileSchema = z.infer<typeof gitHubProfileSchema>;

export const gitHubCredentialSchema = z.object({
  accessToken: z.string().min(1), scopes: z.array(z.string()), profile: gitHubProfileSchema,
  expiresAt: z.number().nullable(), refreshToken: z.string().nullable(), refreshTokenExpiresAt: z.number().nullable(),
});
export type GitHubCredentialSchema = z.infer<typeof gitHubCredentialSchema>;
